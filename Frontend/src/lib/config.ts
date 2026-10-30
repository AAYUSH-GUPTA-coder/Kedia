import addresses from "@kedia/abi/addresses.json";
import { guardedVaultAbi } from "@kedia/abi/GuardedVault";
import { vaultFactoryAbi } from "@kedia/abi/VaultFactory";
import { createConfig, http, injected } from "wagmi";
import { defineChain } from "viem";
import { hashkey, hashkeyTestnet } from "wagmi/chains";
import type { Address } from "viem";

export const cfg = addresses;
export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787";
export const vaultAt = (address: Address) => ({ address, abi: guardedVaultAbi }) as const;
/** Creates one vault per wallet and records which wallet owns which vault. */
export const factory = { address: addresses.factory as Address, abi: vaultFactoryAbi } as const;
/** Shown read-only to visitors without a vault of their own. */
export const DEMO_VAULT = addresses.demoVault as Address;
export const explorerTx = (h: string) => `${addresses.explorer}/tx/${h}`;
export const explorerAddr = (a: string) => `${addresses.explorer}/address/${a}`;

export type Sym = keyof typeof addresses.tokens;
export const SYMS = Object.keys(addresses.tokens) as Sym[];

/**
 * HSK testnet when the addresses file is the testnet one; the local fork keeps mainnet's chain id. viem's testnet
 * entry lacks Multicall3 (deployed at the usual address) and has an old explorer URL, so both are filled in here.
 */
const testnet = defineChain({
  ...hashkeyTestnet,
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 0 } },
  blockExplorers: { default: { name: "HSK Chain Testnet explorer", url: addresses.explorer } },
});
export const chain = addresses.chainId === hashkeyTestnet.id ? testnet : hashkey;
export const TESTNET = chain.id === hashkeyTestnet.id;
// Off mainnet, always the file's own RPC, so a mainnet NEXT_PUBLIC_RPC_URL in .env can never mix two networks.
const RPC_URL = (process.env.NEXT_PUBLIC_KEDIA_NETWORK ?? "mainnet") === "mainnet" ? (process.env.NEXT_PUBLIC_RPC_URL ?? addresses.rpcUrl) : addresses.rpcUrl;
export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [hashkey.id]: http(RPC_URL), [testnet.id]: http(RPC_URL) }, // only the selected chain is used
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
