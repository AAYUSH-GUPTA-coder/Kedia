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
export const VAULT = addresses.vault as Address;
export const ROUTER = addresses.hskswap.swapRouter02 as Address;
export const QUOTER = addresses.hskswap.quoterV2 as Address;
export const RPC_URL = process.env.RPC_URL ?? addresses.rpcUrl;
export const OPERATOR_KEY = () => env('OPERATOR_PRIVATE_KEY') as Hex;
export const PORT = Number(process.env.PORT ?? 8787);
/** When set, the agent decides and simulates but never sends transactions. */
export const SIMULATE_ONLY = process.env.SIMULATE_ONLY === '1';

export type Sym = keyof typeof addresses.tokens; // 'USDT' | 'WHSK' | 'WETH'
export type Asset = Exclude<Sym, 'USDT'>;
export const ASSETS: Asset[] = ['WHSK', 'WETH'];
export const token = (s: Sym) => ({ ...addresses.tokens[s], address: addresses.tokens[s].address as Address });
export const symOf = (addr: string): Sym | undefined =>
  (Object.keys(addresses.tokens) as Sym[]).find((s) => addresses.tokens[s].address.toLowerCase() === addr.toLowerCase());
