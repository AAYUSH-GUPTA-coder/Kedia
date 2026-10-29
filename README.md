# Kedia

**An AI trading agent you can hand your money to, because it cannot break your rules.**

## Why we built it

Kedia lets an AI agent trade your crypto on **HSKSwap**, the DEX on **HSK Chain**, without ever holding your money. You create your own vault, a smart contract only you own, and deposit into it. The agent trades from the vault, but every trade must pass rules you set, and the contract enforces them on-chain. You get an AI agent's speed and attention without handing over control.

What the protocol gives you:

- **A vault you own.** Your funds sit in your own contract. Only you can deposit, withdraw, pause or change its rules, and withdrawals never depend on the price oracle.
- **Your own agent.** Every vault gets its own agent wallet. You fund its gas when you create the vault, top it up or take it back any time, and tune how it trades. It can ask the vault for a swap but can never withdraw.
- **Risk limits enforced by code.** Trade size, a daily stop-loss, allowed tokens, trade frequency and a price sanity check are checked on-chain for every trade.
- **Earnings from price gaps.** The agent trades when HSKSwap prices a token differently from the HashKey Exchange order book, without you watching the market.
- **Control in plain English.** Say "halve my risk" in chat, review the change, and sign it. Rule changes need your signature, and agent settings need your click.
- **Full visibility.** The dashboard shows your positions, P&L, today's stop-loss floor, the agent's reasoning, and every trade and rejection with an explorer link.

Built for the HSK Chain Horizon Hackathon (Mumbai), Track 1: AI Agent Trading.

## Problems in current solution

AI agents can trade around the clock and react in seconds, but letting one trade today means giving it a wallet key. A key can do anything, and today's agents protect you only with instructions in a prompt, which is a request, not a rule. An agent holding your key can be:

- **Wrong.** A bug or a bad model output can place a trade ten times too big.
- **Tricked.** A prompt injection or a manipulated, thin liquidity pool can push it into a terrible fill.
- **Stubborn.** It may keep trading while it loses, because "stop at 5% loss" in a prompt is only a suggestion.

One mistake like these can drain the account. Kedia answers each of them with a check the vault runs on every trade. A smart contract that reverts the transaction is a guarantee.

## When the agent trades

The agent looks for moments when **HSKSwap**, the DEX on **HSK Chain**, prices a token differently from the **HashKey Exchange** order book:

- **It buys** when HSKSwap sells a token more than 0.6% below the exchange price, after fees and price impact.
- **It sells** when HSKSwap pays more than 0.6% above the exchange price.
- **Otherwise it waits.** By default it checks every 30 seconds and trades at most once every 5 minutes, never larger than your max trade size. You can change these and the strategy from the dashboard.

Every trade goes through your vault, which checks it against your limits and refuses anything that breaks them.

## What you get, and how

| You get | How |
|---|---|
| **Hands-off trading** | The agent watches HSKSwap against the HashKey Exchange price and trades when HSKSwap is mispriced. |
| **Custody stays with you** | Funds sit in your vault. The agent's key can only call one function, `executeSwap`, and cannot withdraw. |
| **Limits that cannot be bypassed** | Trade size, daily stop-loss, allowed tokens, trade frequency and a price sanity check are enforced on-chain. A breaking trade reverts. |
| **Your own agent, tuned by you** | Each vault has its own agent wallet that pays its own gas. In the Agent panel you pick the strategy, tokens, trade size, edge, slippage, how often it checks and the minimum gap between its trades. |
| **Control in plain English** | "Halve my risk and stop trading WETH" becomes a proposed rule change. You review the before and after, then sign one transaction. |
| **Full visibility** | The dashboard shows positions, P&L, today's stop-loss floor, the agent's reasoning, and every trade and rejection with an explorer link. |
| **Exit any time** | You can pause trading or withdraw instantly. Withdrawals never depend on the price oracle. |

## Example: one day with a $5,000 vault

You deposit **3,500 USDT and $1,500 of WHSK**, so your vault is worth **$5,000**. You set the max trade to **$500**; the default of $10 is for testing. HSKSwap's WHSK pool fills a $500 trade within about 0.2% of the exchange price, so that is a size the pool handles well. The daily loss cap stays at 5%, so when the agent's first trade of the day records $5,000 as the starting point, today's stop-loss floor is **$4,750**.

The table compares Kedia with a regular trading bot that holds your wallet key. The bot runs the same strategy, so both make the same good trades. HSK's price ends the day where it started, so the difference comes only from the trades.

| Time | What happens | Kedia | Bot holding your key |
|---|---|---|---|
| 10:15 | HSKSwap sells WHSK 0.8% below the exchange price. The agent buys $500 of it. | Kept. **+$4.00**. Vault: $5,004 | Same. $5,004 |
| 11:40 | The agent sells $500 of WHSK. A front-running bot pushes the pool down 12% in the same block. | The fill is worth $440, more than 5% under the oracle value. `ExecutionPriceDeviates`: the swap is undone. Vault: $5,004 | Sells for $440. **−$60**. $4,944 |
| 12:20 | HSKSwap pays 0.9% above the exchange price. The agent sells $500 of WHSK. | Kept. **+$4.50**. Vault: $5,008.50 | Same. $4,948.50 |
| 13:00 | A bug in a strategy update sizes the next order at $3,000. | `TradeTooLarge`. Nothing moves. | Buys $3,000 of WHSK and pays about 1% in price impact. **−$30**. $4,918.50 |
| 14:30 | A message injected into the agent's news feed tells it to put all its cash into a newly launched token. | `TokenNotAllowed`. The token is not on your list, so nothing moves. | Spends all its remaining $944.50 of USDT on the token. $4,918.50 for now |
| 15:10 | HSKSwap sells WHSK 0.7% below the exchange price. The agent buys $500 of it. | Kept. **+$3.50**. Vault: $5,012 | Has no USDT left and misses the trade. $4,918.50 |
| 17:00 | The injected token collapses 80%. | Nothing to lose. $5,012 | **−$755.60**. $4,162.90 |
| 18:00 | You type "halve my risk and stop trading WETH" and press **Sign & apply**. | One transaction: max trade $250, loss cap 2.5%, WETH blocked. The agent cannot undo it. | You edit a config file or prompt and hope the bot follows it. |
| 00:00 UTC | A new day starts. | The next trade records a new starting point. Tomorrow's floor is 2.5% below it, about $4,887. | — |

```mermaid
%%{init: {"themeVariables": {"xyChart": {"plotColorPalette": "#2563eb, #f59e0b, #dc2626"}}}}%%
xychart-beta
    title "Blue = Kedia, Orange = unguarded bot, Red = stop-loss floor"
    x-axis ["10:15", "11:40", "12:20", "13:00", "14:30", "15:10", "17:00"]
    y-axis 4100 --> 5100
    line [5004, 5004, 5008.5, 5008.5, 5008.5, 5012, 5012]
    line [5004, 4944, 4948.5, 4918.5, 4918.5, 4918.5, 4162.9]
    line [4750, 4750, 4750, 4750, 4750, 4750, 4750]
```

Values are in USD. The orange line drops at each event the vault blocked for Kedia.

**End of the day:**

| Strategy | Vault value at 18:00 | Change |
|---|---|---|
| Kedia | **$5,012.00** | **+0.24%** |
| Just holding, no trading | $5,000.00 | 0.00% |
| Bot holding your key | $4,162.90 | −16.74% |

Kedia **earned $12** from three good trades and **avoided $845.60 of losses** that the unguarded bot took on: a front-run fill, a buggy oversized order and an injected token. The bot also missed the third good trade because the injected token had used up its cash.

On a day when HSK itself falls, the tokens you hold fall with the market in any vault. What Kedia adds is the daily loss cap: once the vault is 5% below the day's starting value, `DailyLossCapBreached` refuses every further trade, so the agent cannot keep buying the dip with all your cash. It does not sell what you already hold; to get out completely, press **Pause** or withdraw. Withdrawals never depend on the oracle.

### How much can it earn?

Earnings come from HSKSwap's price drifting away from the HashKey Exchange price. The agent trades only when the gap is over 0.6% after fees, so each good $500 trade earns roughly the gap: about **$4** at a typical 0.8% gap. Gaps of 0.6% to 1.2% showed up in testing.

| Day | Good trades | Earnings | On a $5,000 vault |
|---|---|---|---|
| Quiet | 1 | about $4 | 0.08% |
| Typical | 3 | about $12 | 0.24% |
| Busy | 6 | about $24 | 0.48% |

If typical days repeated every day, that would add up to about $360 a month. Treat that as an upper estimate, not a promise. Gaps shrink as other traders compete for them, and price moves in the tokens you hold usually matter more than trading earnings, as the example day shows. What the vault does guarantee is that no trade breaks your rules.

### Why these numbers grow with HSK Chain

Today's figures are small because today's pools are small. The limit is how much a pool can absorb, not the product.

On HSKSwap, a trade's price impact grows with its size divided by the pool's depth. Today the WHSK pool takes a $500 trade for about 0.2% of price impact. In a pool twice as deep, a $1,000 trade has the same impact, so each price gap is worth about twice as much. More trading activity on the chain also creates price gaps more often, which means more chances to trade.

Keeping the same 0.2% impact and three good trades a day at a 0.8% gap:

| WHSK pool depth | Trade size | Typical day | Typical month | Vault size it suits |
|---|---|---|---|---|
| Today | $500 | about $12 | about $360 | $5,000 |
| 5× today | $2,500 | about $60 | about $1,800 | $25,000 |
| 20× today | $10,000 | about $240 | about $7,200 | $100,000 |

Two things to read correctly in this table:

- **The percentage stays about the same,** roughly 0.24% a day. What grows with liquidity is the amount each trade can carry, so bigger vaults can earn the same rate and total earnings grow with the chain.
- **The growth is not guaranteed to be exactly proportional.** Deeper, busier markets also attract more traders who close price gaps, so gaps can get smaller or shorter-lived as the chain grows.

As HSK Chain and HSKSwap gain liquidity, Kedia can safely handle larger vaults. Its guardrails scale with you: you raise the max trade size in the same chat-and-sign flow, and every other limit still applies.

Each guardrail in the example is checked by a fork test against real HSKSwap pools: `test_revert_executionPriceDeviates_manipulatedPool`, `test_revert_tradeTooLarge`, `test_revert_dailyLossCap_thenResetsNextDay` and `test_ownerBatchesPolicyChangeWithMulticall`.

## How it works

### The pieces

```mermaid
flowchart LR
    User(["You"])
    subgraph Off-chain
        UI["Dashboard<br/>(Next.js)"]
        API["Backend API"]
        Agent["Trading agent<br/>(one agent wallet per vault)"]
        Chat["Chat<br/>Claude Sonnet 5.5<br/>via Hopscotch Labs"]
    end
    subgraph Market data
        HKX["HashKey Exchange<br/>order book"]
        Quoter["HSKSwap<br/>QuoterV2"]
    end
    subgraph HSK Chain
        Factory["VaultFactory<br/>one vault per wallet"]
        Vault[["Your GuardedVault<br/>holds your funds,<br/>enforces your rules"]]
        Swap["HSKSwap<br/>router and pools"]
        Oracle["Supra price oracle<br/>(via SupraFeedAdapter)"]
    end

    User -- "watch and chat" --> UI
    UI --> API
    API --> Chat
    API --> Agent
    Agent -- "reads prices" --> HKX
    Agent -- "reads quotes" --> Quoter
    Agent -- "executeSwap only" --> Vault
    User -- "create vault (once)" --> Factory
    Factory -- "deploys, owned by you" --> Vault
    User -- "wallet: rules, deposit,<br/>withdraw, pause" --> Vault
    Vault -- "swap" --> Swap
    Vault -- "checks prices" --> Oracle
```

There are three roles, and each can do only its own job:

| Role | Holds | Can | Cannot |
|---|---|---|---|
| **You (owner)** | Your wallet | Deposit, withdraw, pause, change rules, replace the agent | Nothing is off limits |
| **The agent (operator)** | Its own wallet per vault, holding only HSK for gas | Ask its own vault for a swap | Withdraw, change rules, trade a blocked token or another user's vault, exceed a limit |
| **The chat model** | No key at all | Read state, propose rule or strategy changes, ask the agent to try a trade you requested | Apply anything without your click or signature |

### Many users, one agent wallet each

Anyone can use the same dashboard. Connecting a wallet that has no vault shows **Create your vault**. One transaction, about 1 HSK in gas plus the HSK you give the agent (5 by default), asks `VaultFactory` to deploy a GuardedVault that this wallet owns. The factory records the wallet-to-vault mapping on-chain (`vaultOf(wallet)`), allows one vault per wallet, and keeps no control after creation.

Creating a vault takes one signature, and the same transaction funds the vault's own agent:

```mermaid
sequenceDiagram
    actor You
    participant UI as Dashboard
    participant API as Backend
    participant F as VaultFactory
    participant V as Your new vault
    participant G as Your agent wallet

    You->>UI: Connect wallet
    UI->>F: vaultOf(your wallet)
    F-->>UI: none yet, show Create your vault
    UI->>API: GET /agent?owner=your wallet
    API-->>UI: your agent's address, derived from the master key and your address
    You->>F: createVault(agent) with 5 HSK attached
    F->>V: deploy with the agent as operator and the default rules
    F->>V: allow USDT, WHSK and WETH
    F->>V: hand ownership to you
    F->>G: forward the 5 HSK for gas
    F-->>UI: VaultCreated, the dashboard switches to your vault
    You->>V: Deposit USDT
    loop every check
        API->>V: executeSwap, signed by your agent wallet and paid with its HSK
        V-->>API: trade kept, or reverted by your rules
    end
    Note over You,G: Later, Top up gas sends HSK from your wallet to the agent,<br/>and Take gas back returns the agent's HSK to the vault owner.
```

Every vault gets its own agent wallet as its operator, and the same transaction sends it the HSK it pays gas with. Each user's trades are paid from their own agent's HSK, and vaults trade in parallel because each agent wallet has its own nonce. The backend derives every agent key from one secret (`AGENT_MASTER_KEY`) and the vault creator's address, so it stores no keys. The agent panel shows the agent wallet; the owner can top it up, or take the HSK back to their wallet at any time.

Each user gets their own pair: a vault their wallet owns and an agent wallet that can only trade that vault.

```mermaid
flowchart TB
    subgraph Users
        A(["Alice's wallet"])
        B(["Bob's wallet"])
    end
    subgraph Chain["HSK Chain"]
        F["VaultFactory<br/>vaultOf: wallet → vault<br/>creatorOf: vault → wallet"]
        VA[["Alice's vault<br/>her funds, her rules"]]
        VB[["Bob's vault<br/>his funds, his rules"]]
        GA(["Agent wallet A<br/>HSK for gas only"])
        GB(["Agent wallet B<br/>HSK for gas only"])
    end
    subgraph Backend["Backend (stores no keys)"]
        MK[/"AGENT_MASTER_KEY<br/>one secret"/]
        KA["Agent key A =<br/>keccak256(master, Alice)"]
        KB["Agent key B =<br/>keccak256(master, Bob)"]
    end

    A -- "owns: deposit, withdraw,<br/>rules, pause" --> VA
    B -- "owns" --> VB
    F -. "created" .-> VA
    F -. "created" .-> VB
    GA -- "executeSwap only" --> VA
    GB -- "executeSwap only" --> VB
    GA -. "reverts NotOperator" .-> VB
    MK --> KA
    MK --> KB
    KA -- "signs as" --> GA
    KB -- "signs as" --> GB
```

The backend finds each vault's agent by reading `creatorOf(vault)` from the factory and deriving the key from it, so no key file is ever written. Agent A trading Bob's vault reverts with `NotOperator`, and neither agent can withdraw from any vault.

The owner also edits the agent's settings in the same panel or by chat: strategy, which tokens it trades, size per trade, edge, slippage, how often it checks prices and the minimum gap between its own trades. These are off-chain settings, so they need no signature, and the vault's on-chain rules still bound every trade.

An agent wallet can only call `executeSwap` on its own vault. Even if the master secret leaked, an attacker could take the gas HSK and make trades inside each owner's rules, but could never withdraw vault funds, and every owner can pause or replace the agent at any time.

Chat, strategy changes and requested trades ask the wallet to sign in once with a free signature ([Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361)). The backend then acts only on the vault that wallet owns, looked up on-chain. Visitors without a wallet see a read-only demo vault.

### What happens on every trade

On every check (every 30 seconds by default) the agent reads three prices:
- the HashKey Exchange order book, used as the reference price
- the price HSKSwap would actually fill at, quoted for the planned trade size
- the oracle price the vault itself uses

The default **mean-reversion** strategy buys when HSKSwap sells more than the edge (0.6% by default) below the exchange price and sells when HSKSwap pays more than the edge above it. The HSKSwap quote already includes the pool fee and price impact; the edge is a margin for the trade back out, a noisy reference price, slippage and gas. A **momentum** strategy is also available: it buys when a fast moving average of the exchange price (about the last 2½ minutes) rises above a slow one (about the last 10 minutes) by more than the edge, and sells on the opposite cross. It needs 20 price samples, about 10 minutes, before its first decision.

The agent trades in full steps of its per-trade size, capped just under the vault's max trade size. It never shorts: if the vault holds less of a token than one trade needs, a sell signal is shown as "not enough" and nothing is sent. It places at most one trade per check.

Before sending, the agent simulates the trade, so a trade the vault would refuse is logged with its reason and costs no gas. When it does send, the vault runs these checks in order:

```mermaid
flowchart TD
    Start(["Agent calls executeSwap"]) --> A{"Called by the operator,<br/>vault not paused?"}
    A -- no --> RA["revert NotOperator / EnforcedPause"]
    A -- yes --> B{"Both tokens on<br/>your allowed list?"}
    B -- no --> RB["revert TokenNotAllowed"]
    B -- yes --> C{"Oracle price fresh,<br/>trade under max size?"}
    C -- no --> RC["revert StaleOracle / TradeTooLarge"]
    C -- yes --> D{"Cooldown since<br/>last trade passed?"}
    D -- no --> RD["revert CooldownActive"]
    D -- yes --> E["First trade today?<br/>Record today's starting equity"]
    E --> F["Swap on HSKSwap"]
    F --> G{"Fill within the price band<br/>of the oracle value?"}
    G -- no --> RG["revert ExecutionPriceDeviates<br/>(swap is undone)"]
    G -- yes --> H{"Equity still above<br/>today's stop-loss floor?"}
    H -- no --> RH["revert DailyLossCapBreached<br/>(swap is undone)"]
    H -- yes --> OK(["Trade kept, TradeExecuted"])
```

The last two checks run after the swap, so a revert undoes the whole trade. That is what makes them hard limits: a thin or manipulated pool cannot fill you far from the market, and no single trade can push you past your daily loss cap.

| Rule | Default | What it stops |
|---|---|---|
| Allowed tokens | USDT, WHSK, WETH | Trading anything you did not approve |
| Max trade size | $10 | A runaway or mistaken order |
| Cooldown | Off | Rapid-fire trading, if you turn it on. The agent already waits its own minimum gap between its trades (5 minutes by default, set in the Agent panel), and trades you ask for in chat go straight through |
| Oracle freshness | 26 hours | Trading on a dead price feed |
| Price band | 5% | Bad fills from thin or manipulated pools |
| Daily loss cap | 5% of the day's starting equity | Losing more than you accepted in one day |

### Changing the rules by chat

```mermaid
sequenceDiagram
    actor You
    participant UI as Dashboard
    participant API as Backend
    participant LLM as Claude Sonnet 5.5<br/>(Hopscotch Labs)
    participant Vault as GuardedVault

    You->>UI: "Halve my risk and stop trading WETH"
    UI->>API: chat message
    API->>LLM: message and tools
    LLM->>API: get_state
    API-->>LLM: positions, current rules
    LLM->>API: propose_policy (max trade $5, loss cap 2.5%, no WETH)
    API->>API: validate the proposal
    API-->>UI: reply and proposal
    UI-->>You: before and after table
    You->>Vault: Sign & apply (one multicall transaction)
    Vault-->>You: rules updated on-chain
    Note over Vault: From the next trade on,<br/>WETH is refused and the $5 cap applies
```

The model only proposes. Rules change on-chain only when the owner wallet signs, because the agent's key cannot call `setPolicy`. Agent settings, such as "switch to momentum with $3 trades", are proposed the same way and apply when you press **Confirm**; they live off-chain, so they need no signature, and the vault's rules still bound every trade.

You can also ask for a trade, such as "swap 10 HSK for USDT". The agent sends it through the vault like any other trade, so the same rules apply. Asking for "buy $100 of WHSK" is refused on-chain with `TradeTooLarge`, which is the demo's main moment.

### Where prices come from

| Source | Used for |
|---|---|
| HashKey Exchange public order book (`HSKUSDT`, `ETHUSDT`) | The reference price the strategy compares against |
| HSKSwap QuoterV2 | The real price a trade of the planned size would get |
| Supra on-chain oracle, through `SupraFeedAdapter` | The price the vault trusts for size limits, the price band and the stop-loss |

APRO also publishes HSK, ETH and USDT feeds on HSK Chain. They only answer wallets and whitelisted contracts; any other contract gets `No access`, and a fork test proves it. The vault therefore reads Supra through a small adapter with the same interface. If APRO whitelists the vault, switching back is one owner call per token, `setAllowedToken(token, aproFeed)`. The APRO addresses are in `ABI/addresses.json` under `aproFeeds`.

## Demo

The demo runs on a local mainnet fork with fake money (see [Demo on a local mainnet fork](#demo-on-a-local-mainnet-fork-fake-money)); the same steps work on mainnet.

1. Without a wallet, the dashboard shows the demo vault read-only.
2. Connect a wallet and press **Create my vault**. One transaction creates the vault and funds its own agent wallet with HSK for gas. Then deposit USDT with the Deposit button.
3. The dashboard shows positions, equity, P&L, today's stop-loss floor, the agent's wallet and gas, and its live reasoning for each token.
4. Let the agent trade. Each trade appears in the log with an explorer link. Press **Edit** in the Agent panel to change its strategy, trade size or edge.
5. In chat, say "halve my risk and stop trading WETH". Review the before and after table, then press **Sign & apply**. WETH shows as blocked.
6. Say "buy $100 of WHSK right now", or press **Try to trade 10× the limit**. The vault reverts on-chain with `TradeTooLarge`, and the explorer link shows the failed transaction.

## Project layout

```
SmartContracts/  Foundry: GuardedVault, VaultFactory, SupraFeedAdapter, mainnet-fork tests, deploy and fork scripts
ABI/             Shared config: addresses.json (mainnet, chain 177), addresses.fork.json (local fork, gitignored) and the generated vault and factory ABIs
Backend/         Node 24 + viem: market data, strategies, agent loop, HTTP API
AI/              Chat: Claude Sonnet 5.5 via Hopscotch Labs, with tools get_state, propose_policy,
                 propose_strategy, attempt_trade
Frontend/        Next.js + wagmi: dashboard, create vault, agent settings and gas, trade log, chat, sign-to-apply, guardrail demo
```

## Getting started

Requirements: Foundry 1.8.6 (`foundryup --install 1.8.6`), Node 24, pnpm.

```bash
git submodule update --init --recursive
pnpm install
pnpm test        # 31 fork tests + backend, AI and frontend unit tests
```

### Demo on a local mainnet fork (fake money)

The fork is a local copy of HSK mainnet with real HSKSwap pools and Supra prices, so the demo behaves like mainnet without spending real funds. Its addresses go to `ABI/addresses.fork.json` (gitignored); `ABI/addresses.json` keeps only the mainnet deployment.

From the repo root, one terminal each:

```bash
pnpm fork:chain      # terminal 1: local copy of HSK mainnet on :8547
```

```bash
pnpm fork:setup      # terminal 2: deploys the factory, funds the demo vault (30 USDT + 300 WHSK) and its agent (5 HSK)
pnpm backend:fork    # then: API on :8787 plus the trading loop, reading the fork file
```

```bash
pnpm frontend:fork   # terminal 3: dashboard at http://localhost:3000, reading the fork file
```

`backend:fork` uses a fork-only agent master key and the fork's own RPC, so your `Backend/.env` values for mainnet are never mixed in; chat still uses your Hopscotch key from `.env`.

In MetaMask, add `http://127.0.0.1:8547` as an RPC URL of the HSK Chain network and select it, so your transactions go to the fork. To try the app as a new user, give your wallet fake HSK and USDT on the fork, then press **Create my vault**:

```bash
cast rpc anvil_setBalance <your address> $(cast to-hex $(cast to-wei 100)) -r http://127.0.0.1:8547
cast rpc anvil_setStorageAt 0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029 $(cast index address <your address> 0) $(cast to-uint256 100000000) -r http://127.0.0.1:8547
```

anvil keeps nothing after it stops, so run `pnpm fork:setup` again after restarting it, and delete `Backend/data/` to clear old fork trades.

### Deploy to mainnet

You need your **owner** wallet and an **agent master key**:

- **Owner**: your wallet. It holds the funds you deposit (about $30 to $50 of USDT plus a little WHSK or WETH) and about 10 HSK: gas to deploy, plus the HSK the demo vault's agent trades with.
- **Agent master key**: a random 32-byte secret the backend derives every agent wallet from. Keep it secret and backed up; the same value goes in `Backend/.env`.

```bash
cast wallet import owner --interactive
cast keccak "$(openssl rand -hex 32)"         # your AGENT_MASTER_KEY
cd SmartContracts
AGENT_MASTER_KEY=<key> forge script script/Deploy.s.sol --rpc-url hsk --account owner --broadcast --verify
```

The script deploys three price adapters and `VaultFactory` with the default rules from the table above. It then creates the owner wallet's own vault, which visitors see as the demo vault, sends its agent wallet 5 HSK (set `AGENT_FUNDING` in wei to change it), and writes the addresses into `ABI/addresses.json`.

### Run against mainnet

```bash
cp Backend/.env.example Backend/.env          # set AGENT_MASTER_KEY and HOPSCOTCH_API_KEY
cp Frontend/.env.example Frontend/.env.local
pnpm backend                                  # API on :8787 plus the trading loop
pnpm frontend                                 # dashboard on :3000
```

Connect your wallet in the dashboard and deposit funds with its Deposit button, not a plain transfer, so P&L counts the deposit. Other users connect their own wallets and create their own vaults.

To open it to other users, host the frontend (Vercel works) with `NEXT_PUBLIC_API_URL` set to the backend's URL. The backend runs a loop that never stops, so it needs an always-on server with a persistent disk for `Backend/data/`. Set `HOST=0.0.0.0` and `FRONTEND_ORIGIN` to the dashboard's URL. Run `SIMULATE_ONLY=1 pnpm backend` to watch decisions without sending transactions.

### Chat model

Chat runs Claude Sonnet 5.5 through the [Hopscotch Labs](https://docs.hopscotchlabs.ai/) gateway. Hopscotch serves this model only on its OpenAI-compatible `/v1/chat/completions` endpoint, so the AI module uses the `openai` client pointed at Hopscotch.

| Variable | Default | |
|---|---|---|
| `HOPSCOTCH_API_KEY` | none | Your `ub_live_...` key. Only chat needs it; the agent trades without it. |
| `HOPSCOTCH_MODEL` | `anthropic/claude-sonnet-5-5` | Hopscotch ids are `provider/model`. |
| `HOPSCOTCH_BASE_URL` | `https://api.hopscotchlabs.ai/v1` | A value without `/v1` is accepted; the code appends it. |

To check the backend can read your key and reach the model, run this from the repo root. It sends one tiny request:

```bash
pnpm check:ai
```

To list the Claude ids your key can call, load the key into your shell first. Without that step, `$HOPSCOTCH_API_KEY` is empty and the command prints nothing.

```bash
export $(grep '^HOPSCOTCH_API_KEY=' Backend/.env)
curl -s https://api.hopscotchlabs.ai/v1/models -H "Authorization: Bearer $HOPSCOTCH_API_KEY" | grep -o '"anthropic/claude[^"]*"'
```

Hopscotch refuses `reasoning_effort` for this model, so requests run at the model's default effort.

## Verified HSK Chain facts (2026-10-25)

| | |
|---|---|
| Chain | id 177, `https://mainnet.hsk.xyz`, explorer `https://hashkey.blockscout.com`, Cancun EVM, gas about 500 gwei |
| HSKSwap | SwapRouter02 `0x2c16…D8F3`, QuoterV2 `0x603f…bFDD`, factory `0x972c…c742` |
| Pools | WHSK/USDT 0.3% `0x4ff5…05dc`, WETH/USDT 0.3% `0xb92b…4c16` |
| Log queries | `eth_getLogs` is capped at 100,000 blocks; the backend scans in chunks |

## Known limits

- One vault per wallet, no upgradeability. Each user pays their own agent's gas; the platform charges nothing yet.
- All agent wallets come from one master secret on the backend, so the backend must be trusted with every agent's gas HSK (never with vault funds).
- Sign-in sessions live in the backend's memory, so a backend restart asks each user to sign in again.
- Agent settings and trade logs are files in `Backend/data/`, kept per vault. The agent's price history for momentum is in memory, so momentum warms up again after a restart.
- The stop-loss is marked at oracle prices, so a lagging feed can hold equity under the floor and block trading until the price recovers or the next UTC day starts. That is the guardrail working. The owner can also reset it by depositing, withdrawing or raising the cap.
- Supra's on-chain prices are refreshed by whoever pushes Supra proofs. The vault refuses to trade if a price is older than the freshness limit.
