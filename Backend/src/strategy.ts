import type { Market } from './market.ts';
import type { LogEntry } from './store.ts';

/**
 * Seconds until the agent may trade again: `gapSeconds` after its last successful trade in the log (newest first).
 * Chat and demo trades neither wait for it nor reset it.
 */
export function agentCooldownLeft(log: Pick<LogEntry, 'ts' | 'kind' | 'source'>[], nowMs: number, gapSeconds: number): number {
  const last = log.find((e) => e.source === 'agent' && e.kind === 'trade');
  return last ? Math.max(0, Math.ceil((last.ts + gapSeconds * 1000 - nowMs) / 1000)) : 0;
}

export type Mode = 'meanReversion' | 'momentum' | 'off';
export type Signal = { action: 'buy' | 'sell' | 'hold'; reason: string };

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

/** Buy when HSKSwap sells the asset below the reference price by more than edge; sell when it pays above. */
export function meanReversion(m: Pick<Market, 'buy' | 'sell' | 'ref'>, edgeBps: number): Signal {
  const edge = edgeBps / 1e4;
  const buyGap = (m.ref - m.buy.price) / m.ref; // >0: pool is cheap
  const sellGap = (m.sell.price - m.ref) / m.ref; // >0: pool is rich
  if (buyGap > edge) return { action: 'buy', reason: `pool ask ${m.buy.price.toPrecision(5)} is ${pct(buyGap)} below ref ${m.ref.toPrecision(5)}` };
  if (sellGap > edge) return { action: 'sell', reason: `pool bid ${m.sell.price.toPrecision(5)} is ${pct(sellGap)} above ref ${m.ref.toPrecision(5)}` };
  return { action: 'hold', reason: `spread within edge (buy gap ${pct(buyGap)}, sell gap ${pct(sellGap)}, need ${pct(edge)})` };
}

export function ema(xs: number[], n: number): number {
  const k = 2 / (n + 1);
  return xs.reduce((e, x, i) => (i === 0 ? x : x * k + e * (1 - k)), 0);
}

/** Fast EMA crossing the slow EMA by more than edge. Holds until there are `slow` samples. */
export function momentum(history: number[], edgeBps: number, fast = 5, slow = 20): Signal {
  if (history.length < slow) return { action: 'hold', reason: `warming up (${history.length}/${slow} samples)` };
  const f = ema(history.slice(-slow), fast);
  const s = ema(history.slice(-slow), slow);
  const d = (f - s) / s;
  if (d > edgeBps / 1e4) return { action: 'buy', reason: `fast EMA ${pct(d)} above slow` };
  if (d < -edgeBps / 1e4) return { action: 'sell', reason: `fast EMA ${pct(-d)} below slow` };
  return { action: 'hold', reason: `EMAs within edge (${pct(d)})` };
}
