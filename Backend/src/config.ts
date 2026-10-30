import { existsSync } from 'node:fs';
import type { Address, Hex } from 'viem';
import { defineChain } from 'viem';
import { hashkey, hashkeyTestnet } from 'viem/chains';
import mainnet from '@kedia/abi/addresses.json' with { type: 'json' };

if (existsSync(new URL('../.env', import.meta.url))) process.loadEnvFile(new URL('../.env', import.meta.url));

/**
 * KEDIA_NETWORK picks the deployment: `testnet` (ABI/addresses.testnet.json, HSK testnet), `fork` (the local fork
 * SmartContracts/fork-setup.sh writes) or, by default, mainnet (ABI/addresses.json).
 */
export const NETWORK = (process.env.KEDIA_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet' | 'fork';
if (!['mainnet', 'testnet', 'fork'].includes(NETWORK)) throw new Error(`KEDIA_NETWORK must be mainnet, testnet or fork, not ${NETWORK}`);
export const ADDRESSES_FILE = NETWORK === 'mainnet' ? 'ABI/addresses.json' : `ABI/addresses.${NETWORK}.json`;
const file = `@kedia/abi/addresses.${NETWORK}.json`; // a variable, so typechecking works before the file exists
const addresses: typeof mainnet = NETWORK === 'mainnet' ? mainnet : (await import(file, { with: { type: 'json' } })).default;

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
// Off mainnet, always the file's own RPC, so a mainnet RPC_URL in .env can never mix two networks.
export const RPC_URL = NETWORK === 'mainnet' ? (process.env.RPC_URL ?? addresses.rpcUrl) : addresses.rpcUrl;
/**
 * The fork keeps mainnet's chain id, so only the testnet file selects the testnet chain. viem's testnet entry lacks
 * Multicall3 (deployed at the usual address) and has an old explorer URL, so both are filled in here.
 */
export const CHAIN = addresses.chainId === hashkeyTestnet.id
  ? defineChain({
    ...hashkeyTestnet,
    contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11', blockCreated: 0 } },
    blockExplorers: { default: { name: 'HSK Chain Testnet explorer', url: addresses.explorer } },
  })
  : hashkey;
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
