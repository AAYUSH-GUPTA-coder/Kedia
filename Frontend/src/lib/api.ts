import { API, type Sym } from "./config";
import { clearSession, sessionToken } from "./session";

export type Policy = { maxTradeUsd: number; dailyLossCapBps: number; maxOracleDeviationBps: number; cooldownSeconds: number; maxOracleAge: number };
export type Position = { sym: Sym; address: string; allowed: boolean; feed: string; balance: number; price: number | null; usd: number };
export type Decision = { sym: string; action: "buy" | "sell" | "hold"; reason: string; ref?: number; buy?: number; sell?: number; oracle?: number };
export type Strategy = { mode: "meanReversion" | "momentum" | "off"; symbols: Sym[]; tradeUsd: number; edgeBps: number; slippageBps: number; loopSeconds: number };
export type State = {
  vault: { address: string; owner: string; operator: string; paused: boolean; policy: Policy; lastTradeAt: number; dayStartEquity: number; lossFloor: number; equity: number; positions: Position[] };
  pnl: { netDepositsUsd: number; pnlUsd: number; dayChangePct: number };
  strategy: Strategy;
  agent: { lastTickAt: number; decisions: Decision[]; lastError: string | null; simulateOnly: boolean; operatorGasHsk: number; cooldownSeconds: number };
};
export type LogEntry = {
  ts: number; kind: "trade" | "rejected" | "simulated"; source: "agent" | "chat" | "demo"; sym: string; side: "buy" | "sell";
  amountIn: string; amountOut?: string; usdIn?: number; usdOut?: number; txHash?: string; error?: { name: string; args: string[] }; reason: string;
};
export type PolicyProposal = Policy & { allowedTokens: Sym[]; rationale: string };
export type StrategyProposal = Partial<Strategy> & { rationale: string };
export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ChatResult = { reply: string; policy?: PolicyProposal; strategy?: StrategyProposal; trades: LogEntry[] };

/** `auth` calls act on the signed-in wallet's own vault; the first one asks the wallet to sign in. */
async function call<T>(path: string, body?: unknown, auth = false): Promise<T> {
  const send = async () => fetch(`${API}${path}`, body === undefined ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${await sessionToken()}` } : {}) },
    body: JSON.stringify(body),
  });
  let r = await send();
  if (r.status === 401 && auth) { clearSession(); r = await send(); } // backend restarted or session expired
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? r.statusText);
  return j as T;
}

export const api = {
  state: (vault: string) => call<State>(`/state?vault=${vault}`),
  log: (vault: string) => call<LogEntry[]>(`/log?vault=${vault}`),
  chat: (messages: ChatTurn[]) => call<ChatResult>("/chat", { messages }, true),
  strategy: (patch: Partial<Strategy>) => call<Strategy>("/strategy", patch, true),
  trade: (t: { symbol: Sym; side: "buy" | "sell"; amount: number; unit: "usd" | "asset" }) => call<LogEntry>("/trade", t, true),
};

export const usd = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;
export const num = (x: number, d = 4) => x.toLocaleString("en-US", { maximumFractionDigits: d });

/** Vault errors carry 8-decimal USD values; show them as dollars. */
const USD_ERRORS: Record<string, string[]> = {
  TradeTooLarge: ["trade", "limit"],
  ExecutionPriceDeviates: ["in", "out", "min out"],
  DailyLossCapBreached: ["equity", "floor"],
};
export function fmtError(e?: { name: string; args: string[] }): string {
  if (!e) return "";
  if (e.name === "CooldownActive") return `CooldownActive: next trade allowed at ${new Date(Number(e.args[0]) * 1000).toLocaleTimeString()}`;
  const labels = USD_ERRORS[e.name];
  if (!labels) return `${e.name}(${e.args.join(", ")})`;
  return `${e.name}: ${e.args.map((a, i) => `${labels[i] ?? "arg"} ${usd(Number(a) / 1e8)}`).join(", ")}`;
}
