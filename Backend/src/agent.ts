import { formatEther, formatUnits, isAddressEqual, parseEventLogs, type Address } from 'viem';
import { ASSETS, cfg, SIMULATE_ONLY, token, type Asset } from './config.ts';
import { guardedVaultAbi } from '@kedia/abi/GuardedVault';
import { agentOf, decodeRevert, listVaults, publicClient, vaultAt } from './chain.ts';
import { readMarket, readVault } from './market.ts';
import { agentCooldownLeft, meanReversion, momentum, type Signal } from './strategy.ts';
import { appendEquity, appendLog, loadStrategy, readLog, type LogEntry } from './store.ts';
import { inputUnits, toRaw, type TradeSize } from './size.ts';

export type Decision = Signal & { sym: Asset | '-'; ref?: number; buy?: number; sell?: number; oracle?: number };
type VaultStatus = { lastTickAt: number; decisions: Decision[]; lastError: string | null };
const statuses = new Map<Address, VaultStatus>();
const histories = new Map<Address, Record<Asset, number[]>>();

/** What the agent last decided for `vault`, for the dashboard and chat. */
export const agentStatus = (vault: Address) => ({
  ...(statuses.get(vault) ?? { lastTickAt: 0, decisions: [], lastError: null }), simulateOnly: SIMULATE_ONLY,
});

type SwapRequest = {
  vault: Address; sym: Asset; side: 'buy' | 'sell'; amountIn: bigint; minOut: bigint;
  source: LogEntry['source']; reason: string;
  /** Send even if simulation reverts, so the vault's rejection is recorded on-chain (demo / user-forced trades). */
  force?: boolean;
};

function swapArgs(sym: Asset, side: 'buy' | 'sell', amountIn: bigint, minOut: bigint) {
  const [tIn, tOut] = side === 'buy' ? [token('USDT'), token(sym)] : [token(sym), token('USDT')];
  return { tIn, tOut, args: [tIn.address, tOut.address, cfg.tokens[sym].fee, amountIn, minOut] as const };
}

/** Dry-runs executeSwap as the vault's agent. Returns the decoded revert, or undefined if the vault would accept it. */
async function simulateSwap(vault: Address, args: ReturnType<typeof swapArgs>['args']): Promise<LogEntry['error']> {
  try {
    await publicClient.simulateContract({ ...vaultAt(vault), functionName: 'executeSwap', args, account: (await agentOf(vault)).account });
  } catch (e) {
    return decodeRevert(e);
  }
}

// Vault rejections that say something about the trade itself. Timing ones (cooldown, stale price) are
// left out: a missing balance would still block the trade later, so that is the more useful answer.
const POLICY_ERRORS = new Set<string>(
  guardedVaultAbi
    .filter((x) => x.type === 'error')
    .map((x) => x.name)
    .filter((n) => !['CooldownActive', 'StaleOracle'].includes(n)),
);

export async function submitSwap(r: SwapRequest): Promise<LogEntry> {
  const { tIn, tOut, args } = swapArgs(r.sym, r.side, r.amountIn, r.minOut);
  const base = { ts: Date.now(), source: r.source, sym: r.sym, side: r.side, amountIn: formatUnits(r.amountIn, tIn.decimals), reason: r.reason };
  const log = (e: Omit<LogEntry, keyof typeof base>) => {
    const entry = { ...base, ...e } as LogEntry;
    appendLog(r.vault, entry);
    return entry;
  };

  const error = await simulateSwap(r.vault, args);
  if (SIMULATE_ONLY) return log({ kind: error ? 'rejected' : 'simulated', error });
  if (error && !r.force) return log({ kind: 'rejected', error });

  // A fixed gas limit skips estimation, which would otherwise refuse to send a reverting tx.
  const hash = await (await agentOf(r.vault)).writeContract({ ...vaultAt(r.vault), functionName: 'executeSwap', args, gas: error ? 600_000n : undefined });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === 'reverted') return log({ kind: 'rejected', txHash: hash, error: error ?? { name: 'Reverted', args: [] } });

  const [ev] = parseEventLogs({ abi: guardedVaultAbi, logs: receipt.logs, eventName: 'TradeExecuted' });
  return log({
    kind: 'trade', txHash: hash, amountOut: formatUnits(ev.args.amountOut, tOut.decimals),
    usdIn: Number(ev.args.usdIn) / 1e8, usdOut: Number(ev.args.usdOut) / 1e8,
  });
}

/** One agent step for one vault: read it and the market, pick a signal per asset, place at most one trade. */
export async function tick(vault: Address): Promise<void> {
  const decisions: Decision[] = [];
  const st = statuses.get(vault) ?? { lastTickAt: 0, decisions: [], lastError: null };
  statuses.set(vault, st);
  try {
    await decide(vault, decisions);
    st.lastError = null;
  } catch (e) {
    st.lastError = e instanceof Error ? e.message : String(e);
    console.error(`[agent ${vault.slice(0, 8)}]`, st.lastError);
  } finally {
    st.lastTickAt = Date.now();
    st.decisions = decisions; // publish once complete so the dashboard never shows a half-built tick
  }
}

async function decide(vault: Address, decisions: Decision[]): Promise<void> {
  const s = loadStrategy(vault);
  const v = await readVault(vault);
  appendEquity(vault, { ts: Date.now(), equityUsd: v.equity, floorUsd: v.lossFloor });
  if (s.mode === 'off') return void decisions.push({ sym: '-', action: 'hold', reason: 'The agent is switched off' });

  if (v.paused) return void decisions.push({ sym: '-', action: 'hold', reason: 'Trading is paused by the owner' });
  if (!isAddressEqual(v.operator, (await agentOf(vault)).account.address)) return void decisions.push({ sym: '-', action: 'hold', reason: 'This vault uses a different agent wallet' });
  if ((await publicClient.getBalance({ address: v.operator })) === 0n) return void decisions.push({ sym: '-', action: 'hold', reason: 'Out of gas: top up the agent wallet' });
  const cooldownLeft = agentCooldownLeft(readLog(vault), Date.now(), s.minGapSeconds);
  const history = histories.get(vault) ?? { WHSK: [], WETH: [] };
  histories.set(vault, history);
  const usd = Math.min(s.tradeUsd, v.policy.maxTradeUsd * 0.98); // margin for USDT/oracle rounding
  const usdt = v.positions.find((p) => p.sym === 'USDT')!;

  for (const sym of s.symbols) {
    const pos = v.positions.find((p) => p.sym === sym)!;
    if (!pos.allowed || !pos.price) {
      decisions.push({ sym, action: 'hold', reason: "Not allowed by the vault's rules" });
      continue;
    }
    const m = await readMarket(sym, usd, pos.price);
    history[sym] = [...history[sym], m.ref].slice(-200);
    const sig = s.mode === 'momentum' ? momentum(history[sym], s.edgeBps) : meanReversion(m, s.edgeBps);
    const d: Decision = { sym, ...sig, ref: m.ref, buy: m.buy.price, sell: m.sell.price, oracle: m.oracle };
    decisions.push(d);
    if (sig.action === 'hold') continue;
    if (cooldownLeft) {
      d.reason += `. Next trade allowed in ${Math.ceil(cooldownLeft / 60)} min`;
      continue;
    }
    const [amountIn, quoted, have] = sig.action === 'buy' ? [m.buy.usdtIn, m.buy.assetOut, usdt.raw] : [m.sell.assetIn, m.sell.usdtOut, pos.raw];
    if (have < amountIn) {
      d.reason += `, but the vault holds less ${sig.action === 'buy' ? 'USDT' : sym} than one trade needs`;
      continue;
    }
    const minOut = (quoted * BigInt(10_000 - s.slippageBps)) / 10_000n;
    await submitSwap({ vault, sym, side: sig.action, amountIn, minOut, source: 'agent', reason: sig.reason });
    return; // one trade per tick
  }
}

/** A trade the user asked for in chat or with the demo button. The vault decides whether it happens. */
export async function manualTrade(vault: Address, sym: Asset, side: 'buy' | 'sell', size: TradeSize, source: 'chat' | 'demo'): Promise<LogEntry> {
  if (!ASSETS.includes(sym)) throw new Error(`unknown asset ${sym}`);
  const v = await readVault(vault);
  const price = v.positions.find((p) => p.sym === sym)!.price;
  if (!price) throw new Error(`no price for ${sym}`);
  const inSym = side === 'buy' ? 'USDT' : sym;
  const amountIn = toRaw(inputUnits(side, size, price), token(inSym).decimals);
  if (amountIn === 0n) throw new Error('trade amount rounds to zero');
  const label = size.unit === 'usd' ? `$${size.amount} of ${sym}` : `${size.amount} ${sym}`;

  // Not enough balance: stop here with a plain message, unless the vault's own rules reject the
  // trade first (e.g. TradeTooLarge in the breach demo), which should still land on-chain.
  const have = v.positions.find((p) => p.sym === inSym)!.raw;
  if (have < amountIn) {
    const err = await simulateSwap(vault, swapArgs(sym, side, amountIn, 0n).args);
    if (!err || !POLICY_ERRORS.has(err.name)) {
      const fmt = (x: bigint) => formatUnits(x, token(inSym).decimals);
      throw new Error(`The vault holds ${fmt(have)} ${inSym}, not enough to ${side} ${label} (needs ${fmt(amountIn)} ${inSym}). Nothing was sent.`);
    }
  }
  // minOut 0: the vault's oracle price band is the slippage guard being demonstrated.
  return submitSwap({ vault, sym, side, amountIn, minOut: 0n, source, reason: `You asked to ${side} ${label}`, force: true });
}

/** Sends the HSK in `vault`'s agent wallet back to the vault's current owner, keeping enough to pay for this transfer. */
export async function withdrawAgentGas(vault: Address) {
  const agent = await agentOf(vault);
  const [owner, balance, fees] = await Promise.all([
    publicClient.readContract({ ...vaultAt(vault), functionName: 'owner' }),
    publicClient.getBalance({ address: agent.account.address }),
    publicClient.estimateFeesPerGas(),
  ]);
  const gas = await publicClient.estimateGas({ account: agent.account, to: owner, value: 1n });
  const keep = gas * fees.maxFeePerGas * 2n; // 2x: headroom for a fee rise and the OP-stack L1 data fee
  if (balance <= keep) throw new Error(`The agent wallet holds ${formatEther(balance)} HSK, too little to send back.`);
  const hash = await agent.sendTransaction({ to: owner, value: balance - keep, gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
  await publicClient.waitForTransactionReceipt({ hash });
  return { txHash: hash, amountHsk: formatEther(balance - keep) };
}

const WAKE_MS = 5000;

/** Wakes every few seconds and ticks every factory vault whose own loopSeconds has passed, in parallel: each vault has its own agent wallet and nonce. */
export function startLoop() {
  const loop = async () => {
    try {
      const due = (await listVaults()).filter((v) => Date.now() - (statuses.get(v)?.lastTickAt ?? 0) >= loadStrategy(v).loopSeconds * 1000);
      await Promise.all(due.map(tick)); // tick records its own errors
    } catch (e) {
      console.error('[agent]', e instanceof Error ? e.message : e);
    }
    setTimeout(loop, WAKE_MS);
  };
  void loop();
}
