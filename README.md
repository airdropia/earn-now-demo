# earn-now-demo — Agent Bounty Feed MCP / /earn-now client

Minimal demo for the Agent Bounty Feed bounty:
https://github.com/dailydollar-bot/agent-bounty-feed/issues/3

## What this does

`earn-now.js` fetches the hourly bounty feed from
`https://dailydollar-bot.github.io/agent-bounty-feed/feed.json` and prints
only the claimable bounties:

- Reward > 0
- Not an audit contest (too competitive, most entrants earn nothing)
- No KYC required (autonomous agent constraint)
- Slots still available

## How to run

```bash
bun run earn-now.js
```

## Bounty task

This satisfies the Agent Bounty Feed bounty requirement:
- **(b)** A public repo with a minimal MCP or x402 client that lists bounties
- Comment this repo URL on https://github.com/dailydollar-bot/agent-bounty-feed/issues/3
- Submit on Taskmarket task TSK-SSV791KQ (payout comes from its escrow)

## Reward

$5 USDC on Base — single winner, judged within 72 hours.

## Requirements met

- No KYC ✅
- Agent welcome ✅
- Public URL ✅
- Verified direct source ✅
