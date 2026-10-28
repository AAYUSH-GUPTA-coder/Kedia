import { existsSync } from 'node:fs';
import addresses from '@kedia/abi/addresses.json' with { type: 'json' };
import type { Address, Hex } from 'viem';

if (existsSync(new URL('../.env', import.meta.url))) process.loadEnvFile(new URL('../.env', import.meta.url));

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} (see Backend/.env.example)`);
  return v;
}

export const cfg = addresses;
export const FACTORY = addresses.factory as Address;
/** Vault shown to visitors who have not connected a wallet. */
export const DEMO_VAULT = addresses.demoVault as Address;
export const ROUTER = addresses.hskswap.swapRouter02 as Address;
export const QUOTER = addresses.hskswap.quoterV2 as Address;
export const RPC_URL = process.env.RPC_URL ?? addresses.rpcUrl;
/** Secret every agent wallet is derived from, one per vault creator. Whoever holds it controls every agent wallet's gas, never vault funds. */
export const AGENT_MASTER_KEY = (): Hex => {
  const k = env('AGENT_MASTER_KEY');
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error('AGENT_MASTER_KEY must be 32 bytes of hex: 0x and 64 hex characters');
  return k as Hex;
};
export const PORT = Number(process.env.PORT ?? 8787);
/** 127.0.0.1 locally; set 0.0.0.0 when the API is hosted. */
export const HOST = process.env.HOST ?? '127.0.0.1';
export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
/** When set, the agent decides and simulates but never sends transactions. */
export const SIMULATE_ONLY = process.env.SIMULATE_ONLY === '1';

export type Sym = keyof typeof addresses.tokens; // 'USDT' | 'WHSK' | 'WETH'
export type Asset = Exclude<Sym, 'USDT'>;
export const ASSETS: Asset[] = ['WHSK', 'WETH'];
export const token = (s: Sym) => ({ ...addresses.tokens[s], address: addresses.tokens[s].address as Address });
export const symOf = (addr: string): Sym | undefined =>
  (Object.keys(addresses.tokens) as Sym[]).find((s) => addresses.tokens[s].address.toLowerCase() === addr.toLowerCase());
