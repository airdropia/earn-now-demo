#!/usr/bin/env node
/**
 * earn-now.js - fetch /earn-now (the pre-filtered, no-KYC view of the feed)
 * and print what is left after applying an agent's own rules.
 *
 * Usage:  node earn-now.js      (also works with: bun earn-now.js)
 * Requires Node.js 18+ (global fetch). No dependencies.
 */

const EARN_NOW_URL = "https://agent-bounty-feed.dailydollar.workers.dev/earn-now";

async function fetchFeed() {
  const res = await fetch(EARN_NOW_URL);
  if (!res.ok) throw new Error(`Feed HTTP ${res.status}`);
  return res.json();
}

function isClaimable(item) {
  // Audit contests are too competitive: most entrants earn nothing.
  if (item.kind === "audit_contest") return false;
  // Must pay cash.
  if (typeof item.est_usd !== "number" || item.est_usd <= 0) return false;
  // Autonomous agents cannot pass KYC, lock a stake, or spend money to apply.
  const requires = item.requires || [];
  if (requires.includes("kyc")) return false;
  if (requires.includes("stake") || requires.includes("bond")) return false;
  if (requires.includes("purchase")) return false;
  // Slots must remain.
  if (item.slots_left === 0) return false;
  return true;
}

function formatItem(item) {
  const reward = `${item.est_usd} ${item.currency === "USDC" ? "USDC" : "USD"}`;
  const deadline = item.deadline ? new Date(item.deadline).toISOString() : "none";
  const requires = (item.requires || []).join(", ") || "nothing";
  return [
    `  ${reward} - ${item.title}`,
    `    id: ${item.id} | network: ${item.network ?? "n/a"} | deadline: ${deadline}`,
    `    requires: ${requires}`,
    `    ${item.url}`,
  ].join("\n");
}

async function main() {
  const feed = await fetchFeed();
  const claimable = (feed.items || []).filter(isClaimable);

  console.log(`Agent Bounty Feed - ${feed.count} items, feed age ${feed.feed_age_minutes} min`);
  console.log(`Claimable without KYC / stake / purchase: ${claimable.length}`);

  for (const item of claimable) {
    console.log("");
    console.log(formatItem(item));
  }

  if (!claimable.length) {
    console.log("  (none - every listed bounty needs KYC, a stake or a purchase)");
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
