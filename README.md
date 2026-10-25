# Guarded Trader

An AI agent that trades on **HSKSwap** inside limits enforced by a vault contract on **HSK Chain mainnet**.
Built for the HSK Chain Horizon Hackathon (Mumbai), Track 1: AI Agent Trading.

The user's funds sit in `GuardedVault`, not in the agent's wallet. The agent holds only an operator key that can call one function, `executeSwap`, and the vault checks every trade against the user's policy:

| Rule | Enforced how |
|---|---|
| Allowed tokens | Token must have a price feed registered by the owner |
| Max trade size | USD value of the input at the oracle price |
| Cooldown | Minimum seconds between trades |
| Oracle freshness | Feed answer must be younger than `maxOracleAge` |
| Oracle price band | Realized output value must be within `maxOracleDeviationBps` of input value, so a thin or manipulated pool cannot fill far from the market |
| Daily loss cap (stop-loss) | Oracle-marked equity may not fall more than `dailyLossCapBps` below the day's opening equity, checked after every swap |

Only the owner wallet can change the policy, pause, deposit or withdraw. A chat turns "halve my risk and stop trading WETH" into a proposed policy; the owner signs it as one `multicall` transaction. Nothing the model says can loosen a limit by itself.

## Layout

```
SmartContracts/  Foundry: GuardedVault, SupraFeedAdapter, mainnet-fork tests, deploy script
ABI/             Shared config: addresses.json (chain 177) and the generated vault ABI (JSON + typed TS)
Backend/         Node 24 + viem: market data, strategies, agent loop, HTTP API
AI/              Claude Sonnet 5.5 tool-use chat via Hopscotch Labs: get_state, propose_policy, propose_strategy, attempt_trade
Frontend/        Next.js + wagmi: dashboard, trade log, chat, sign-to-apply, guardrail demo
```

## How the agent decides

Every `loopSeconds` the agent reads the vault, the HashKey Exchange order book (`HSKUSDT`, `ETHUSDT`), executable HSKSwap quotes from QuoterV2, and the vault's oracle feeds.

- **Mean reversion** (default): buy when the pool's all-in ask is more than `edgeBps` below the exchange mid, sell when its bid is more than `edgeBps` above.
- **Momentum**: fast vs slow EMA of the reference price.

Each swap is simulated first. A trade the vault would reject is logged with the decoded reason and costs no gas. Trades the user requests from chat or the demo button are sent even if they will revert, so the rejection is visible on-chain.

## Oracle note: APRO vs Supra

APRO's HSK/USD, ETH/USD and USDT/USD feeds on HSK mainnet sit behind a read-access whitelist. EOAs can read them, but any unlisted contract gets `No access`. `test_aproRejectsContractsButAgreesWithSupra` proves this on a fork.

The vault therefore reads Supra's on-chain storage (`0x58e1…9d57`, pairs 517 HSK, 1 ETH, 48 USDT) through `SupraFeedAdapter`, which exposes the same `AggregatorV3Interface`. If APRO whitelists the vault, switching is one owner call per token: `setAllowedToken(token, aproFeed)`. The APRO feed addresses are in `ABI/addresses.json` under `aproFeeds`.

## Setup

Requirements: Foundry 1.8.6 (`foundryup --install 1.8.6`), Node 24, pnpm.

```bash
git submodule update --init --recursive
pnpm install
pnpm test        # 21 fork tests + backend, AI and frontend unit tests
```

### Deploy to mainnet

You need two wallets:

- **Owner**: your wallet. It holds the funds you deposit (about $30 to $50 of USDT plus a little WHSK or WETH) and about 5 HSK for gas.
- **Operator**: a fresh key for the agent. It needs about 2 HSK for gas and never holds funds.

```bash
cast wallet import owner --interactive
cd SmartContracts
OPERATOR=<operator address> forge script script/Deploy.s.sol --rpc-url hsk --account owner --broadcast --verify
./export-abi.sh
```

The script deploys the vault and three feed adapters, allows USDT, WHSK and WETH, sets the default policy, and writes the addresses into `ABI/addresses.json`. The default policy is a $10 max trade, a 5% daily loss cap, a 5% oracle band, a 300s cooldown and a 26h max oracle age.

### Run

```bash
cp Backend/.env.example Backend/.env          # set OPERATOR_PRIVATE_KEY and HOPSCOTCH_API_KEY
cp Frontend/.env.example Frontend/.env.local
pnpm backend                                  # API on :8787 plus the trading loop
pnpm frontend                                 # dashboard on :3000
```

Then connect the owner wallet in the dashboard and deposit funds. Use the dashboard's Deposit button rather than a plain transfer, so P&L counts the deposit. Use `SIMULATE_ONLY=1 pnpm backend` to watch decisions without sending transactions.

### Chat model

Chat runs Claude Sonnet 5.5 through the [Hopscotch Labs](https://docs.hopscotchlabs.ai/) gateway on its Anthropic Messages endpoint. The code uses the Anthropic SDK pointed at `https://api.hopscotchlabs.ai`.

| Variable | Default | |
|---|---|---|
| `HOPSCOTCH_API_KEY` | none | Your `ub_live_...` key. Only chat needs it; the agent trades without it. |
| `HOPSCOTCH_MODEL` | `anthropic/claude-sonnet-5-5` | Hopscotch ids are `provider/model`. |
| `HOPSCOTCH_BASE_URL` | `https://api.hopscotchlabs.ai` | The bare origin; the SDK appends `/v1/messages`. |

To confirm the exact model id your key can call:

```bash
curl -s https://api.hopscotchlabs.ai/v1/models -H "Authorization: Bearer $HOPSCOTCH_API_KEY" | grep -o '"anthropic/claude[^"]*"'
```

Hopscotch does not forward `anthropic-beta` headers, so beta-only features such as server-side refusal fallbacks are not used.

## Demo script

1. The dashboard shows positions, equity, P&L, today's stop-loss floor and the agent's live reasoning.
2. Let the agent trade: entries appear in the log with explorer links.
3. In chat, say "halve my risk and stop trading WETH". Review the before and after diff, then press **Sign & apply**. One owner transaction applies it, and WETH shows as blocked.
4. Say "buy $100 of WHSK right now", or press **Try to trade 10× the limit**. The vault reverts on-chain with `TradeTooLarge`, and the explorer link shows the failed transaction.

## Verified HSK Chain facts (2026-10-25)

| | |
|---|---|
| Chain | id 177, `https://mainnet.hsk.xyz`, explorer `https://hashkey.blockscout.com`, Cancun EVM, gas about 500 gwei |
| HSKSwap | SwapRouter02 `0x2c16…D8F3`, QuoterV2 `0x603f…bFDD`, factory `0x972c…c742` |
| Pools | WHSK/USDT 0.3% `0x4ff5…05dc`, WETH/USDT 0.3% `0xb92b…4c16` |
| Log queries | `eth_getLogs` is capped at 100,000 blocks; the backend scans in chunks |

## Known limits

- Single owner, single vault, no upgradeability. Backend has no auth and binds to 127.0.0.1.
- The stop-loss is oracle-marked, so a stale or lagging feed can halt trading for the rest of the UTC day. That is the guardrail working. The owner resets it by depositing, withdrawing or raising the cap.
- Supra storage is refreshed by whoever pushes Supra proofs; the vault refuses to trade if a price is older than `maxOracleAge`.
