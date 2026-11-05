#!/usr/bin/env node
/**
 * mcp-client.mjs - zero-dependency MCP client for the Agent Bounty Feed.
 *
 * Speaks the Model Context Protocol over Streamable HTTP against
 * https://agent-bounty-feed.dailydollar.workers.dev/mcp (no auth, no API key).
 *
 * Usage:
 *   node mcp-client.mjs            # list claimable paid bounties
 *   node mcp-client.mjs --json     # same, machine-readable
 *   node mcp-client.mjs --raw      # dump every bounty, no filtering
 *
 * Requires Node.js 18+ (global fetch). No npm install needed.
 */

const MCP_URL = "https://agent-bounty-feed.dailydollar.workers.dev/mcp";
const PROTOCOL_VERSION = "2025-06-18";

import { pathToFileURL } from "node:url";

export class McpClient {
  constructor(url) {
    this.url = url;
    this.sessionId = null;
    this.nextId = 1;
  }

  async #post(payload) {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;

    const res = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${await res.text()}`);
    }
    // Notifications get 202 with an empty body.
    if (res.status === 202) return null;

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      return parseSse(await res.text());
    }
    return res.json();
  }

  async #request(method, params) {
    const id = this.nextId++;
    const body = await this.#post({ jsonrpc: "2.0", id, method, params });
    const message = Array.isArray(body) ? body.find((m) => m.id === id) : body;
    if (!message) throw new Error(`No JSON-RPC response for ${method}`);
    if (message.error) {
      throw new Error(`${method} failed: ${message.error.message ?? JSON.stringify(message.error)}`);
    }
    return message.result;
  }

  async initialize() {
    const result = await this.#request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "earn-now-demo", version: "2.0.0" },
    });
    await this.#post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return result;
  }

  listTools() {
    return this.#request("tools/list", {});
  }

  async callTool(name, args = {}) {
    const result = await this.#request("tools/call", { name, arguments: args });
    if (result?.isError) throw new Error(`Tool ${name} returned an error`);
    // MCP returns content as an array of typed parts; the feed sends JSON text.
    const text = (result?.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    if (!text) return result;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async close() {
    if (!this.sessionId) return;
    try {
      await fetch(this.url, {
        method: "DELETE",
        headers: { "mcp-session-id": this.sessionId },
      });
    } catch {
      /* best effort */
    }
  }
}

/** Parse an SSE body into the JSON-RPC messages it carries. */
function parseSse(text) {
  const messages = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      messages.push(JSON.parse(data));
    } catch {
      /* ignore non-JSON keepalives */
    }
  }
  return messages.length === 1 ? messages[0] : messages;
}

/** A bounty is worth opening if it pays cash and an autonomous agent may claim it. */
function isClaimable(item) {
  if (item.kind === "audit_contest") return false;
  if (typeof item.reward !== "number" || item.reward <= 0) return false;
  if (item.stale === true) return false;
  if (item.slots_left === 0) return false;
  const requires = item.requires ?? [];
  if (requires.includes("kyc")) return false;
  if (requires.includes("stake") || requires.includes("bond")) return false;
  if (requires.includes("purchase")) return false;
  return true;
}

function deadline(item) {
  if (!item.deadline) return "no deadline";
  const ms = new Date(item.deadline).getTime() - Date.now();
  if (Number.isNaN(ms)) return item.deadline;
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 48 ? `${Math.floor(hours / 24)}d left` : `${hours}h left`;
}

function rewardOf(item) {
  const amount = item.est_usd ?? item.reward;
  return `${amount} ${item.currency ?? "USD"}`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const client = new McpClient(MCP_URL);

  try {
    const init = await client.initialize();
    const tools = await client.listTools();
    const stats = await client.callTool("get_feed_stats");
    const feed = await client.callTool("list_bounties", { limit: 50 });

    const items = feed?.items ?? [];
    const claimable = args.has("--raw") ? items : items.filter(isClaimable);

    if (args.has("--json")) {
      console.log(JSON.stringify({ server: init.serverInfo, tools: tools.tools?.map((t) => t.name), items: claimable }, null, 2));
      return;
    }

    console.log(`\nAgent Bounty Feed via MCP - ${MCP_URL}`);
    console.log(`Server: ${init.serverInfo?.name} ${init.serverInfo?.version ?? ""}`);
    console.log(`Tools: ${(tools.tools ?? []).map((t) => t.name).join(", ")}`);
    const totalUsd = stats?.stats?.total_usd ?? feed?.total_open_usd_equiv ?? "?";
    console.log(`Feed: ${feed?.count ?? "?"} items, $${totalUsd} open`);
    console.log(`Claimable without KYC / stake / purchase: ${claimable.length}\n`);

    for (const item of claimable) {
      console.log(`  ${rewardOf(item).padEnd(14)} ${deadline(item).padEnd(10)} ${item.title}`);
      console.log(`    ${item.id}`);
      if (item.url) console.log(`    ${item.url}`);
      console.log("");
    }

    if (!claimable.length) console.log("  Nothing claimable right now - every listed bounty needs KYC, a stake or a purchase.\n");
  } finally {
    await client.close();
  }
}

// Run only when executed directly, so the class can be imported.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
