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

/** The owner's edit form, in the units people think in: dollars, percent, seconds, hours. */
export type PolicyForm = { maxTradeUsd: string; dailyLossCapPct: string; maxOracleDeviationPct: string; cooldownSeconds: string; maxOracleAgeHours: string; allowedTokens: string[] };

export const toPolicyForm = (p: OnchainPolicy, allowedTokens: string[]): PolicyForm => ({
  maxTradeUsd: String(p.maxTradeUsd),
  dailyLossCapPct: String(p.dailyLossCapBps / 100),
  maxOracleDeviationPct: String(p.maxOracleDeviationBps / 100),
  cooldownSeconds: String(p.cooldownSeconds),
  maxOracleAgeHours: String(p.maxOracleAge / 3600),
  allowedTokens,
});

/** Converts the form to contract units, or says what to fix. Ranges match the chat proposal validator. */
export function parsePolicyForm(f: PolicyForm): { policy: OnchainPolicy & { allowedTokens: string[] } } | { error: string } {
  const n = (s: string) => (s.trim() === "" ? NaN : Number(s));
  const [usd, loss, dev, cd, age] = [n(f.maxTradeUsd), n(f.dailyLossCapPct), n(f.maxOracleDeviationPct), n(f.cooldownSeconds), Math.round(n(f.maxOracleAgeHours) * 3600)];
  if (!(usd > 0 && usd <= 10_000)) return { error: "Max trade size must be more than $0 and at most $10,000." };
  if (!(loss >= 0 && loss <= 100)) return { error: "Daily loss cap must be between 0% and 100%." };
  if (!(dev >= 0 && dev <= 100)) return { error: "Max fill shortfall must be between 0% and 100%." };
  if (!(Number.isInteger(cd) && cd >= 0 && cd <= 86_400)) return { error: "Cooldown must be whole seconds from 0 to 86,400. Use 0 to turn it off." };
  if (!(age >= 60 && age <= 604_800)) return { error: "Max oracle age must be between 1 minute and 168 hours." };
  return {
    policy: { maxTradeUsd: usd, dailyLossCapBps: Math.round(loss * 100), maxOracleDeviationBps: Math.round(dev * 100), cooldownSeconds: cd, maxOracleAge: age, allowedTokens: f.allowedTokens },
  };
}
