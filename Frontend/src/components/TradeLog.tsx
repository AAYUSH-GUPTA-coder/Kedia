import type { LogEntry } from "@/lib/api";
import { fmtError, usd } from "@/lib/api";
import { Panel, TxLink } from "./ui";

export function TradeLog({ log }: { log: LogEntry[] }) {
  return (
    <Panel title="Trades and rejections">
      <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
        {log.map((e, i) => (
          <li key={i} className={`rounded-lg border p-2 ${e.kind === "trade" ? "border-emerald-500/20 bg-emerald-500/5" : e.kind === "rejected" ? "border-rose-500/25 bg-rose-500/5" : "border-white/10"}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`text-xs font-semibold uppercase ${e.kind === "trade" ? "text-emerald-400" : e.kind === "rejected" ? "text-rose-400" : "text-white/50"}`}>{e.kind}</span>
              <span>{e.side} {e.sym}</span>
              <span className="text-white/50">in {Number(e.amountIn).toPrecision(5)} {e.side === "buy" ? "USDT" : e.sym}</span>
              {e.usdIn !== undefined && <span className="tabular-nums text-white/50">{usd(e.usdIn)} → {usd(e.usdOut ?? 0)}</span>}
              <span className="text-xs text-white/30">{e.source} · {new Date(e.ts).toLocaleTimeString()}</span>
              <TxLink hash={e.txHash} />
            </div>
            {e.error && <div className="mt-1 font-mono text-xs text-rose-300">{fmtError(e.error)}</div>}
            <div className="mt-0.5 text-xs text-white/40">{e.reason}</div>
          </li>
        ))}
        {log.length === 0 && <li className="text-white/40">No trades yet.</li>}
      </ul>
    </Panel>
  );
}
