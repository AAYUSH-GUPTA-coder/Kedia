type Entry = { kind: "trade" | "rejected" | "simulated"; side: "buy" | "sell"; sym: string; amountIn: string };

/** Trades the vault refused and what they would have moved, valued at today's prices (USDT in for buys, the token in for sells). */
export function blocked(log: Entry[], priceOf: (sym: string) => number) {
  const refused = log.filter((e) => e.kind === "rejected");
  const usd = refused.reduce((sum, e) => sum + Number(e.amountIn) * priceOf(e.side === "buy" ? "USDT" : e.sym), 0);
  return { count: refused.length, usd };
}
