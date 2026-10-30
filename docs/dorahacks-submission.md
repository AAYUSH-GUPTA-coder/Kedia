# DoraHacks submission: Kedia

Copy-paste text for the BUIDL form of the HSK Chain Horizon Hackathon · India (Track 1: AI Agent Trading). Deadline: 1 Nov 2026, 21:30 IST. Everything below matches the README; if one changes, change the other.

Fill the three placeholders before submitting: `<DEMO_VIDEO_URL>`, `<LIVE_DASHBOARD_URL>`, and the mainnet addresses.

---

## BUIDL name

Kedia

## Tagline (short description, one line)

An AI trading agent that gives the best returns 24/7 with safety.

## Track

AI Agent Trading

## Category and tags

Category: Crypto / Web3

Tags: AI Agent Trading, DeFi, Crypto-AI, HSK Chain, HSKSwap, Security, Wallet, Horizon Hackathon

## Links

| Field | Value |
|---|---|
| GitHub | https://github.com/AAYUSH-GUPTA-coder/Kedia |
| Demo video | `<DEMO_VIDEO_URL>` |
| Live demo | `<LIVE_DASHBOARD_URL>` (no wallet needed to view the demo vault) |
| Mainnet contracts | VaultFactory `<address>`, demo GuardedVault `<address>`, verified on https://hashkey.blockscout.com |

## Details (project description)

**The problem.** AI agents can watch markets all day and act in seconds, but today the only way to let one trade is to give it a wallet key. A key can do anything. The agent's "rules" live in a prompt, and a prompt is a request, not a guarantee. One wrong model output, one prompt injection, or one buggy strategy update can drain the account.

**What Kedia does.** Kedia moves the rules out of the prompt and into a smart contract. You create your own `GuardedVault` on HSK Chain in one transaction and deposit into it. The vault gets its own agent wallet, holding only HSK for gas, that can call exactly one function: `executeSwap`. On every trade the vault checks, on-chain, that the trade is under your max size, uses only tokens you allowed, respects your cooldown, trades on a fresh oracle price, fills within a price band of the oracle value, and keeps equity above today's stop-loss floor. The price band and the stop-loss are checked after the swap, in the same transaction, so a manipulated pool or a bad fill is undone rather than discouraged. Anything that breaks a rule reverts.

**The agent.** Every 30 seconds it reads the HashKey Exchange order book, an HSKSwap QuoterV2 quote for the exact trade size, and the on-chain oracle. It buys when HSKSwap sells a token more than 0.6% below the exchange price after fees and price impact, sells when HSKSwap pays more than 0.6% above it, and otherwise waits. A momentum strategy (fast/slow EMA cross) is also available. Trades the vault would refuse are simulated first and logged with the reason, so they cost no gas. No manual step is needed for any trade.

**Natural-language control.** The dashboard has a chat powered by Claude Sonnet 5.5 with four tools: read positions, P&L and rules; propose a new on-chain policy; propose new agent settings (strategy, tokens, trade size, edge, frequency); attempt a trade. "Halve my risk and stop trading WETH" becomes a before/after table you sign in one multicall transaction. The model never holds a key, and the agent's key cannot change rules, so nothing changes on-chain without your signature.

**Multi-user by design.** One `VaultFactory` deploys one vault per wallet, owned by the creator, and keeps no control afterwards. The backend derives each vault's agent key from one secret and the creator's address, so it stores no key files, and an agent for one vault reverts with `NotOperator` on any other vault. Even a leaked backend secret could not withdraw from any vault.

**Built on HSK Chain with the ecosystem's products.** HSKSwap SwapRouter02 and QuoterV2 for execution and quotes; HashKey Exchange public API for the reference price; Supra's on-chain oracle through a small adapter that exposes Chainlink's `AggregatorV3Interface`, so feeds are swappable per token. We evaluated APRO's feeds first and found them read-whitelisted for contracts on HSK mainnet; a fork test documents it, and switching back is one owner call per token once a vault is whitelisted.

**Status.** All code was written during the hackathon (first commit 25 Oct 2026). 31 Foundry tests run against a fork of HSK mainnet with the real HSKSwap pools, including a test that manipulates the live WHSK/USDT pool and shows the vault undoing the trade, plus 10 unit tests for strategy and sizing. Contracts are deployed to HSK Chain mainnet at the addresses above. _(Keep this sentence only once the deployment is done; if it is not, replace it with: "Mainnet deployment is in progress; all tests run against a fork of mainnet.")_ Not yet built: a platform fee, upgradeable vaults, persistent sessions across backend restarts.

**Why it can win the track.** The brief asks for autonomous execution, spread capture, strict risk control and stop-loss, and conversational control of sizing, frequency, risk appetite and target assets. Kedia does all of it, and its risk control is the one part of an AI trading system that cannot be prompted away.

## Progress during the hackathon (milestones)

- 25 Oct: GuardedVault and SupraFeedAdapter written and fork-tested against HSKSwap on HSK mainnet. Backend agent loop with mean-reversion and momentum strategies. Chat routed through Hopscotch Labs to Claude Sonnet 5.5 with tool calling, including exact-amount trades requested in chat.
- 28 Oct: VaultFactory so any wallet creates its own vault, then one agent wallet per vault funded at creation. Sign-In with Ethereum sessions so the backend acts only on the vault a wallet owns. Owner edits the on-chain policy from the dashboard. Agent's own trade spacing so chat trades are never held back. Dashboard redesign, markdown chat replies, renamed to Kedia.
- 29 Oct: Guardrail demo card, equity chart, brand pack, README and submission text.
- Before the deadline: mainnet deployment with Blockscout verification, hosted dashboard, demo video.

## Short answers for custom questions

**What problem does it solve?**
Letting an AI agent trade means handing it a key, and prompt-level risk rules are not enforceable. Kedia makes the rules a smart contract the agent cannot bypass, so users get autonomous trading without giving up custody or control.

**Value proposition in one sentence.**
The speed and attention of an AI trading agent, with limits enforced by code instead of promises, in a vault only you own.

**Who is it for?**
Anyone holding USDT, HSK or ETH on HSK Chain who wants an agent to trade HSKSwap for them but will not hand over a wallet key: retail users first, and a base for funds and DAOs that need enforceable mandates.

**Technical achievements.**
1. Post-swap guardrails: the fill-price band and daily stop-loss are checked on the real fill inside the same transaction, so a bad fill reverts. Verified by a fork test that manipulates the live WHSK/USDT pool.
2. Capability-minimal agent key: one function on one vault, derived per vault from a master secret with no stored key files; a compromised backend cannot withdraw.
3. Oracle adapter pattern: Supra storage exposed as `AggregatorV3Interface`, chosen after discovering APRO's read whitelist on HSK mainnet (documented by a test).
4. LLM that proposes but never applies: four tools, structured proposals validated server-side, applied only by the owner's signature (one multicall) or click.
5. 31 mainnet-fork tests plus 10 unit tests, Cancun-targeted Solidity with transient-storage reentrancy guard, all written in the hackathon window.

**Which officially recommended products did you use?**
HSKSwap (SwapRouter02, QuoterV2, the WHSK/USDT and WETH/USDT pools), HSK Chain mainnet, HashKey Exchange public market data API, Supra oracle on HSK Chain. APRO feeds evaluated and documented.

**What makes it innovative?**
It separates "who decides" from "what is allowed". The agent and the chat model decide; a contract the user owns decides what is allowed. That split lets the agent run unattended without the user trusting the model, the prompt or the backend.

**What is deployed on HSK Chain mainnet?**
VaultFactory, three SupraFeedAdapters (USDT, WHSK, WETH) and the demo GuardedVault, verified on Blockscout. Addresses in the Links table and in `ABI/addresses.json`.

**What's next?**
A hosted multi-user deployment, more token pairs as HSKSwap liquidity grows, a small platform fee, and letting a vault owner delegate to a strategy provider under the same on-chain limits.

**Team.**
Aayush Gupta, solo. GitHub @AAYUSH-GUPTA-coder. Attending the Mumbai demo day in person.

## 30-second pitch for demo day

"Every AI trading agent today needs your wallet key, and its risk rules are a paragraph in a prompt. Kedia puts the rules in a contract. Your funds sit in a vault only you own. The agent gets a key that can do one thing: ask your vault for a swap. The vault checks size, tokens, price and your daily stop-loss on-chain and reverts anything else. You tell it 'halve my risk' in chat and sign once. Watch: I'll ask it to buy ten times my limit. The transaction goes out, and the chain says no."
