import addresses from "@kedia/abi/addresses.json";
import { guardedVaultAbi } from "@kedia/abi/GuardedVault";
import { createConfig, http, injected } from "wagmi";
import { hashkey } from "wagmi/chains";
import type { Address } from "viem";

export const cfg = addresses;
export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787";
export const vault = { address: addresses.vault as Address, abi: guardedVaultAbi } as const;
export const explorerTx = (h: string) => `${addresses.explorer}/tx/${h}`;
export const explorerAddr = (a: string) => `${addresses.explorer}/address/${a}`;

export type Sym = keyof typeof addresses.tokens;
export const SYMS = Object.keys(addresses.tokens) as Sym[];

// NEXT_PUBLIC_RPC_URL lets the UI talk to a local anvil fork during development.
export const wagmiConfig = createConfig({
  chains: [hashkey],
  connectors: [injected()],
  transports: { [hashkey.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? addresses.rpcUrl) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
