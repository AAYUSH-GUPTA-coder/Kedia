import { formatUnits, parseEventLogs } from 'viem';
import { ASSETS, cfg, SIMULATE_ONLY, token, type Asset } from './config.ts';
import { decodeRevert, publicClient, vault, wallet } from './chain.ts';
import { readMarket, readVault } from './market.ts';
import { meanReversion, momentum, type Signal } from './strategy.ts';
import { appendLog, loadStrategy, type LogEntry } from './store.ts';
import { inputUnits, toRaw, type TradeSize } from './size.ts';

export type Decision = Signal & { sym: Asset | '-'; ref?: number; buy?: number; sell?: number; oracle?: number };
export const status = { lastTickAt: 0, decisions: [] as Decision[], lastError: null as string | null, simulateOnly: SIMULATE_ONLY };

const history: Record<Asset, number[]> = { WHSK: [], WETH: [] };

type SwapRequest = {
  sym: Asset; side: 'buy' | 'sell'; amountIn: bigint; minOut: bigint;
  source: LogEntry['source']; reason: string;
  /** Send even if simulation reverts, so the vault's rejection is recorded on-chain (demo / user-forced trades). */
  force?: boolean;
};

function swapArgs(sym: Asset, side: 'buy' | 'sell', amountIn: bigint, minOut: bigint) {
  const [tIn, tOut] = side === 'buy' ? [token('USDT'), token(sym)] : [token(sym), token('USDT')];
  return { tIn, tOut, args: [tIn.address, tOut.address, cfg.tokens[sym].fee, amountIn, minOut] as const };
}

/** Dry-runs executeSwap as the operator. Returns the decoded revert, or undefined if the vault would accept it. */
async function simulateSwap(args: ReturnType<typeof swapArgs>['args']): Promise<LogEntry['error']> {
  try {
    await publicClient.simulateContract({ ...vault, functionName: 'executeSwap', args, account: wallet().account });
  } catch (e) {
    return decodeRevert(e);
  }
}

// Vault rejections that say something about the trade itself. Timing ones (cooldown, stale price) are
// left out: a missing balance would still block the trade later, so that is the more useful answer.
const POLICY_ERRORS = new Set<string>(
  vault.abi
    .filter((x) => x.type === 'error')
    .map((x) => x.name)
    .filter((n) => !['CooldownActive', 'StaleOracle'].includes(n)),
);

export async function submitSwap(r: SwapRequest): Promise<LogEntry> {
  const { tIn, tOut, args } = swapArgs(r.sym, r.side, r.amountIn, r.minOut);
  const base = { ts: Date.now(), source: r.source, sym: r.sym, side: r.side, amountIn: formatUnits(r.amountIn, tIn.decimals), reason: r.reason };
  const log = (e: Omit<LogEntry, keyof typeof base>) => {
    const entry = { ...base, ...e } as LogEntry;
    appendLog(entry);
    return entry;
  };

  const error = await simulateSwap(args);
  if (SIMULATE_ONLY) return log({ kind: error ? 'rejected' : 'simulated', error });
  if (error && !r.force) return log({ kind: 'rejected', error });

  // A fixed gas limit skips estimation, which would otherwise refuse to send a reverting tx.
  const hash = await wallet().writeContract({ ...vault, functionName: 'executeSwap', args, gas: error ? 600_000n : undefined });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === 'reverted') return log({ kind: 'rejected', txHash: hash, error: error ?? { name: 'Reverted', args: [] } });

  const [ev] = parseEventLogs({ abi: vault.abi, logs: receipt.logs, eventName: 'TradeExecuted' });
  return log({
    kind: 'trade', txHash: hash, amountOut: formatUnits(ev.args.amountOut, tOut.decimals),
    usdIn: Number(ev.args.usdIn) / 1e8, usdOut: Number(ev.args.usdOut) / 1e8,
  });
}

/** One agent step: read the vault and market, pick a signal per asset, place at most one trade. */
export async function tick(): Promise<void> {
  const decisions: Decision[] = [];
  try {
    await decide(decisions);
  } finally {
    status.lastTickAt = Date.now();
    status.decisions = decisions; // publish once complete so the dashboard never shows a half-built tick
  }
}

async function decide(decisions: Decision[]): Promise<void> {
  const s = loadStrategy();
  if (s.mode === 'off') return void decisions.push({ sym: '-', action: 'hold', reason: 'agent stopped (mode off)' });

  const v = await readVault();
  if (v.paused) return void decisions.push({ sym: '-', action: 'hold', reason: 'vault paused by owner' });
  const cooling = Date.now() / 1000 < v.lastTradeAt + v.policy.cooldownSeconds;
  const usd = Math.min(s.tradeUsd, v.policy.maxTradeUsd * 0.98); // margin for USDT/oracle rounding
  const usdt = v.positions.find((p) => p.sym === 'USDT')!;

  for (const sym of s.symbols) {
    const pos = v.positions.find((p) => p.sym === sym)!;
    if (!pos.allowed || !pos.price) {
      decisions.push({ sym, action: 'hold', reason: 'not allowed by vault policy' });
      continue;
    }
    const m = await readMarket(sym, usd, pos.price);
    history[sym] = [...history[sym], m.ref].slice(-200);
    const sig = s.mode === 'momentum' ? momentum(history[sym], s.edgeBps) : meanReversion(m, s.edgeBps);
    const d: Decision = { sym, ...sig, ref: m.ref, buy: m.buy.price, sell: m.sell.price, oracle: m.oracle };
    decisions.push(d);
    if (sig.action === 'hold') continue;
    if (cooling) {
      d.reason += ' (waiting for vault cooldown)';
      continue;
    }
    const [amountIn, quoted, have] = sig.action === 'buy' ? [m.buy.usdtIn, m.buy.assetOut, usdt.raw] : [m.sell.assetIn, m.sell.usdtOut, pos.raw];
    if (have < amountIn) {
      d.reason += ` (not enough ${sig.action === 'buy' ? 'USDT' : sym})`;
      continue;
    }
    const minOut = (quoted * BigInt(10_000 - s.slippageBps)) / 10_000n;
    await submitSwap({ sym, side: sig.action, amountIn, minOut, source: 'agent', reason: sig.reason });
    return; // one trade per tick; the vault enforces the cooldown anyway
  }
}

/** A trade the user asked for in chat or with the demo button. The vault decides whether it happens. */
export async function manualTrade(sym: Asset, side: 'buy' | 'sell', size: TradeSize, source: 'chat' | 'demo'): Promise<LogEntry> {
  if (!ASSETS.includes(sym)) throw new Error(`unknown asset ${sym}`);
  const v = await readVault();
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
    const err = await simulateSwap(swapArgs(sym, side, amountIn, 0n).args);
    if (!err || !POLICY_ERRORS.has(err.name)) {
      const fmt = (x: bigint) => formatUnits(x, token(inSym).decimals);
      throw new Error(`The vault holds ${fmt(have)} ${inSym}, not enough to ${side} ${label} (needs ${fmt(amountIn)} ${inSym}). Nothing was sent.`);
    }
  }
  // minOut 0: the vault's oracle price band is the slippage guard being demonstrated.
  return submitSwap({ sym, side, amountIn, minOut: 0n, source, reason: `user asked to ${side} ${label}`, force: true });
}

export function startLoop() {
  const loop = async () => {
    try {
      await tick();
      status.lastError = null;
    } catch (e) {
      status.lastError = e instanceof Error ? e.message : String(e);
      console.error('[agent]', status.lastError);
    }
    setTimeout(loop, loadStrategy().loopSeconds * 1000);
  };
  void loop();
}
