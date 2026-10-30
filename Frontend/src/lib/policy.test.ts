import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData } from "viem";
import { guardedVaultAbi } from "@kedia/abi/GuardedVault";
import { parsePolicyForm, proposalCalls, toPolicyForm } from "./policy.ts";

const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const tokens = [
  { sym: "USDT", address: A(1), allowed: true, feed: A(11) },
  { sym: "WHSK", address: A(2), allowed: true, feed: A(12) },
  { sym: "WETH", address: A(3), allowed: false, feed: A(0) },
];
const base = { maxTradeUsd: 5, dailyLossCapBps: 250, maxOracleDeviationBps: 500, cooldownSeconds: 300, maxOracleAge: 93600 };

test("halve risk and stop trading WHSK encodes setPolicy then a disallow", () => {
  const calls = proposalCalls({ ...base, allowedTokens: ["USDT", "WETH"] }, tokens, { WETH: A(13) }).map((data) => decodeFunctionData({ abi: guardedVaultAbi, data }));
  assert.equal(calls[0].functionName, "setPolicy");
  assert.equal((calls[0].args![0] as { maxTradeUsd: bigint }).maxTradeUsd, 500_000_000n);
  assert.deepEqual(calls.slice(1).map((c) => [c.functionName, ...(c.args as string[])]), [
    ["setAllowedToken", A(2), A(0)], // WHSK blocked
    ["setAllowedToken", A(3), A(13)], // WETH re-allowed with its configured feed
  ]);
});

test("unchanged token list only sets policy, missing feed is an error", () => {
  assert.equal(proposalCalls({ ...base, allowedTokens: ["USDT", "WHSK"] }, tokens, {}).length, 1);
  assert.throws(() => proposalCalls({ ...base, allowedTokens: ["USDT", "WHSK", "WETH"] }, tokens, {}), /no price feed/);
});

test("edit form round-trips to contract units and rejects out-of-range values", () => {
  const form = toPolicyForm(base, ["USDT"]);
  assert.deepEqual(parsePolicyForm(form), { policy: { ...base, allowedTokens: ["USDT"] } });
  assert.deepEqual(parsePolicyForm({ ...form, dailyLossCapPct: "2.5", maxOracleAgeHours: "0.5" }), { policy: { ...base, dailyLossCapBps: 250, maxOracleAge: 1800, allowedTokens: ["USDT"] } });
  for (const bad of [{ maxTradeUsd: "0" }, { maxTradeUsd: "" }, { dailyLossCapPct: "101" }, { cooldownSeconds: "1.5" }, { maxOracleAgeHours: "0" }]) {
    assert.ok("error" in parsePolicyForm({ ...form, ...bad }), JSON.stringify(bad));
  }
});
