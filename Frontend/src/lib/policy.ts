import { encodeFunctionData, type Address, type Hex } from "viem";
import { guardedVaultAbi } from "@kedia/abi/GuardedVault";

export type OnchainPolicy = { maxTradeUsd: number; dailyLossCapBps: number; maxOracleDeviationBps: number; cooldownSeconds: number; maxOracleAge: number };
type TokenInfo = { sym: string; address: Address; allowed: boolean; feed: Address };
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Encodes a proposal as the calls for one owner-signed vault.multicall:
 * setPolicy, then setAllowedToken for every token whose allowed state changes.
 * `feeds` maps symbol to the feed used when re-allowing a token.
 */
export function proposalCalls(p: OnchainPolicy & { allowedTokens: string[] }, tokens: TokenInfo[], feeds: Record<string, string>): Hex[] {
  const calls: Hex[] = [
    encodeFunctionData({
      abi: guardedVaultAbi,
      functionName: "setPolicy",
      args: [{
        maxTradeUsd: BigInt(Math.round(p.maxTradeUsd * 1e8)),
        dailyLossCapBps: p.dailyLossCapBps,
        maxOracleDeviationBps: p.maxOracleDeviationBps,
        cooldownSeconds: p.cooldownSeconds,
        maxOracleAge: p.maxOracleAge,
      }],
    }),
  ];
  for (const t of tokens) {
    const want = p.allowedTokens.includes(t.sym);
    if (want === t.allowed) continue;
    const feed = want ? ((t.feed !== ZERO ? t.feed : feeds[t.sym]) as Address) : ZERO;
    if (want && (!feed || feed === ZERO)) throw new Error(`no price feed configured for ${t.sym}`);
    calls.push(encodeFunctionData({ abi: guardedVaultAbi, functionName: "setAllowedToken", args: [t.address, feed] }));
  }
  return calls;
}
