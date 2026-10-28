import type { LogEntry } from "@/lib/api";
import { fmtError, usd } from "@/lib/api";
import { Panel, Tag, TxLink } from "./ui";

const KIND = {
  trade: ["Trade", "good"],
  rejected: ["Rejected", "bad"],
  simulated: ["Simulated", "warn"],
} as const;

export function TradeLog({ log }: { log: LogEntry[] }) {
  return (
    <Panel flush title="Trades and rejections" right={log.length ? <span className="text-xs text-faint">{log.length} total · newest first</span> : null}>
      <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto">
        {log.map((e, i) => {
          const [text, tone] = KIND[e.kind];
          return (
            <li key={i} className="grid gap-x-3 gap-y-2 px-4 py-3 text-sm sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]">
              <span className="flex items-center justify-between gap-3 sm:block sm:pt-0.5"><Tag tone={tone}>{text}</Tag><span className="font-mono text-xs text-muted tabular-nums sm:hidden">{new Date(e.ts).toLocaleTimeString()}</span></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="font-medium capitalize">{e.side} {e.sym}</span>
                  <span className="font-mono text-xs text-muted tabular-nums">{Number(e.amountIn).toPrecision(5)} {e.side === "buy" ? "USDT" : e.sym} in</span>
                  {e.usdIn !== undefined && <span className="font-mono text-xs text-muted tabular-nums">{usd(e.usdIn)} → {usd(e.usdOut ?? 0)}</span>}
                </div>
                {e.error && <p className="mt-1 font-mono text-xs text-down">{fmtError(e.error)}</p>}
                <p className="mt-1 text-xs text-faint">{e.reason}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-faint sm:flex-col sm:items-end sm:gap-0.5">
                <span className="hidden font-mono tabular-nums text-muted sm:inline">{new Date(e.ts).toLocaleTimeString()}</span>
                <span className="capitalize">{e.source}</span>
                <TxLink hash={e.txHash} />
              </div>
            </li>
          );
        })}
        {log.length === 0 && <li className="px-4 py-4 text-sm text-faint">No trades yet. Entries appear here when the agent trades, or when the vault rejects a trade on-chain.</li>}
      </ul>
    </Panel>
  );
}
