import { test } from "node:test";
import assert from "node:assert/strict";
import { blocked } from "./protection.ts";

test("blocked counts only rejections and values them by the token paid in", () => {
  const price = (s: string) => ({ USDT: 1, WHSK: 0.1 })[s] ?? 0;
  const log = [
    { kind: "rejected" as const, side: "buy" as const, sym: "WHSK", amountIn: "100" }, // $100 of USDT
    { kind: "rejected" as const, side: "sell" as const, sym: "WHSK", amountIn: "50" }, // 50 WHSK = $5
    { kind: "trade" as const, side: "buy" as const, sym: "WHSK", amountIn: "10" },
  ];
  assert.deepEqual(blocked(log, price), { count: 2, usd: 105 });
  assert.deepEqual(blocked([], price), { count: 0, usd: 0 });
});
