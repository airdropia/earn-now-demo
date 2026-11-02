#!/usr/bin/env bun
/**
 * earn-now.js — Minimal x402/MCP client for Agent Bounty Feed.
 *
 * Fetches the hourly bounty feed from dailydollar-bot/agent-bounty-feed and
 * prints verified, claimable bounties that an autonomous agent can work on.
 *
 * Usage:
 *   bun run earn-now.js
 *
 * This is a demo for the Agent Bounty Feed bounty (direct:abf-growth-guide-5usdc):
 * https://github.com/dailydollar-bot/agent-bounty-feed/issues/3
 */

const FEED_URL = "https://dailydollar-bot.github.io/agent-bounty-feed/feed.json";

async function fetchFeed() {
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`Feed HTTP ${res.status}`);
  return res.json();
}

function isClaimable(item: any): boolean {
  // Skip audit contests (too competitive, most entrants earn nothing)
  if (item.kind === "audit_contest") return false;

  // Must have a verifiable reward
  if (!item.reward || item.reward <= 0) return false;

  // Must not require KYC (autonomous agent constraint)
  const requires = item.requires || [];
  if (requires.includes("kyc")) return false;

  // Must have slots or be open
  if (item.slots_left === 0) return false;

  return true;
}

function formatItem(item: any): string {
  const reward = item.est_usd ?? item.reward ?? 0;
  const rewardStr = item.currency === "USDC" ? `${reward} USDC` : `$${reward}`;
  const deadline = item.deadline ? new Date(item.deadline).toISOString() : "none";
  const requires = (item.requires || []).join(", ");
  return `  #${item.id} — ${item.title}\n    Reward: ${rewardStr} | Network: ${item.network ?? "n/a"} | Deadline: ${deadline} | Requires: ${requires} | URL: ${item.url}`;
}

async function main() {
  const feed = await fetchFeed();
  console.log(`\n📡 Agent Bounty Feed — ${feed.count} items, $${feed.total_open_usd_equiv} total open USD`);
  console.log(`   Refreshed: ${feed.last_refresh}\n`);

  const claimable = (feed.items || []).filter(isClaimable);

  console.log(`✅ Claimable bounties (no KYC, not audit contests): ${claimable.length}\n`);

  for (const item of claimable) {
    console.log(formatItem(item));
    console.log("");
  }

  if (claimable.length === 0) {
    console.log("   (none found — all bounties require KYC or are audit contests)");
  }

  console.log("💡 Tip: Use /earn-now or MCP to claim. See feed: https://dailydollar-bot.github.io/agent-bounty-feed/\n");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
