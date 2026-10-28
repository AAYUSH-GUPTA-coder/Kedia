"use client";

import { createSiweMessage } from "viem/siwe";
import { getConnection, signMessage } from "wagmi/actions";
import { hashkey } from "wagmi/chains";
import { API, wagmiConfig } from "./config";

const key = (address: string) => `guarded-trader:session:${address.toLowerCase()}`;
const pending = new Map<string, Promise<string>>();

function read(address: string): string | null {
  try { return sessionStorage.getItem(key(address)); } catch { return null; }
}

/** Bearer token for the connected wallet. Signs in with Ethereum (one signature, no gas, valid 24h) when there is none. */
export async function sessionToken(): Promise<string> {
  const { address } = getConnection(wagmiConfig);
  if (!address) throw new Error("Connect your wallet first.");
  const have = read(address);
  if (have) return have;
  // Two calls at once share one wallet prompt.
  if (!pending.has(address)) pending.set(address, signIn(address).finally(() => pending.delete(address)));
  return pending.get(address)!;
}

async function signIn(address: `0x${string}`): Promise<string> {
  const { nonce } = (await (await fetch(`${API}/nonce`)).json()) as { nonce: string };
  const message = createSiweMessage({
    domain: location.host, uri: location.origin, address, version: "1", chainId: hashkey.id, nonce,
    statement: "Sign in to Guarded Trader. This does not send a transaction or cost gas.",
    expirationTime: new Date(Date.now() + 24 * 3600_000),
  });
  const signature = await signMessage(wagmiConfig, { message });
  const r = await fetch(`${API}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature }) });
  const j = (await r.json()) as { token?: string; error?: string };
  if (!r.ok || !j.token) throw new Error(j.error ?? "Sign-in failed");
  try { sessionStorage.setItem(key(address), j.token); } catch { /* private mode: sign in again next time */ }
  return j.token;
}

export function clearSession() {
  const { address } = getConnection(wagmiConfig);
  if (address) try { sessionStorage.removeItem(key(address)); } catch { /* ignore */ }
}
