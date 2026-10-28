import type { LogEntry } from "@/lib/api";
import { fmtError, usd } from "@/lib/api";
import { Panel, TxLink } from "./ui";

const KIND = {
  trade: ["Trade", "text-emerald-400"],
  rejected: ["Rejected", "text-rose-400"],
  simulated: ["Simulated", "text-amber-300"],
} as const;

export function TradeLog({ log }: { log: LogEntry[] }) {
  return (
    <Panel title="Trades and rejections" right={log.length ? <span className="text-xs text-white/45">{log.length} total · newest first</span> : null}>
      <ul className="max-h-[32rem] divide-y divide-white/[0.06] overflow-y-auto border-t border-white/10">
        {log.map((e, i) => {
          const [label, color] = KIND[e.kind];
          return (
            <li key={i} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-x-3 py-3 text-sm">
              <span className={`text-xs font-semibold leading-5 ${color}`}>{label}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="font-medium capitalize">{e.side} {e.sym}</span>
                  <span className="text-white/55 tabular-nums">{Number(e.amountIn).toPrecision(5)} {e.side === "buy" ? "USDT" : e.sym} in</span>
                  {e.usdIn !== undefined && <span className="text-white/55 tabular-nums">{usd(e.usdIn)} → {usd(e.usdOut ?? 0)}</span>}
                </div>
                {e.error && <p className="mt-1 font-mono text-xs text-rose-300">{fmtError(e.error)}</p>}
                <p className="mt-1 text-xs text-white/45">{e.reason}</p>
              </div>
              <div className="text-right text-xs text-white/40 tabular-nums">
                <div>{new Date(e.ts).toLocaleTimeString()}</div>
                <div className="capitalize">{e.source}</div>
                <TxLink hash={e.txHash} />
              </div>
            </li>
          );
        })}
        {log.length === 0 && <li className="py-3 text-sm text-white/40">No trades yet. Entries appear here when the agent trades, or when the vault rejects a trade on-chain.</li>}
      </ul>
    </Panel>
  );
}
