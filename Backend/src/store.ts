import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import type { Address } from 'viem';
import type { Asset } from './config.ts';
import type { Mode } from './strategy.ts';

const DATA = new URL('../data/', import.meta.url);

/** Backend/data/<vault>/<name>. The address is checked so it can never escape the data folder. */
function file(vault: Address, name: string): URL {
  const v = vault.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(v)) throw new Error(`bad vault address ${vault}`);
  const dir = new URL(`${v}/`, DATA);
  mkdirSync(dir, { recursive: true });
  return new URL(name, dir);
}

function readJson<T>(file: URL, fallback: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback;
}
/** Write-then-rename so a crash mid-write never leaves a truncated file. */
function writeJson(file: URL, data: unknown) {
  const tmp = new URL(file.href + '.tmp');
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}

/** Off-chain knobs the user changes by chat without signing. On-chain limits live in the vault. */
export type Strategy = { mode: Mode; symbols: Asset[]; tradeUsd: number; edgeBps: number; slippageBps: number; loopSeconds: number; minGapSeconds: number };
export const DEFAULT_STRATEGY: Strategy = { mode: 'meanReversion', symbols: ['WHSK', 'WETH'], tradeUsd: 5, edgeBps: 60, slippageBps: 50, loopSeconds: 30, minGapSeconds: 300 };

export const loadStrategy = (vault: Address): Strategy => ({ ...DEFAULT_STRATEGY, ...readJson<Partial<Strategy>>(file(vault, 'state.json'), {}) });

export function saveStrategy(vault: Address, patch: Partial<Strategy>): Strategy {
  const s = { ...loadStrategy(vault), ...patch };
  const bad = validateStrategy(s);
  if (bad) throw new Error(bad);
  writeJson(file(vault, 'state.json'), s);
  return s;
}

export function validateStrategy(s: Strategy): string | null {
  if (!['meanReversion', 'momentum', 'off'].includes(s.mode)) return `unknown mode ${s.mode}`;
  if (!Array.isArray(s.symbols) || s.symbols.some((x) => !['WHSK', 'WETH'].includes(x))) return 'symbols must be a subset of WHSK, WETH';
  if (!(s.tradeUsd > 0 && s.tradeUsd <= 1000)) return 'tradeUsd must be in (0, 1000]';
  if (!(s.edgeBps >= 0 && s.edgeBps <= 2000)) return 'edgeBps must be in [0, 2000]';
  if (!(s.slippageBps >= 0 && s.slippageBps <= 1000)) return 'slippageBps must be in [0, 1000]';
  if (!(s.loopSeconds >= 5 && s.loopSeconds <= 3600)) return 'loopSeconds must be in [5, 3600]';
  if (!(Number.isInteger(s.minGapSeconds) && s.minGapSeconds >= 0 && s.minGapSeconds <= 86_400)) return 'minGapSeconds must be an integer in [0, 86400]';
  return null;
}

export type LogEntry = {
  ts: number;
  kind: 'trade' | 'rejected' | 'simulated';
  source: 'agent' | 'chat' | 'demo';
  sym: Asset; side: 'buy' | 'sell';
  amountIn: string; amountOut?: string; usdIn?: number; usdOut?: number;
  txHash?: string;
  error?: { name: string; args: string[] };
  reason: string;
};

const MAX_LOG = 500;
export const readLog = (vault: Address): LogEntry[] => readJson<LogEntry[]>(file(vault, 'trades.json'), []);
export function appendLog(vault: Address, e: LogEntry) {
  writeJson(file(vault, 'trades.json'), [e, ...readLog(vault)].slice(0, MAX_LOG));
  console.log(`[${vault.slice(0, 8)}] [${e.kind}] ${e.source} ${e.side} ${e.sym}: ${e.error ? `${e.error.name}(${e.error.args.join(', ')})` : e.reason}${e.txHash ? ` tx=${e.txHash}` : ''}`);
}
