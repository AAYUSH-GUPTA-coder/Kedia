import type { State } from "@/lib/api";
import { num } from "@/lib/api";
import { Panel } from "./ui";

const tone = { buy: "text-emerald-400", sell: "text-amber-400", hold: "text-white/45" };
const MODE = { meanReversion: "Mean reversion", momentum: "Momentum", off: "Off" };

export function Decisions({ s }: { s: State }) {
  const a = s.agent;
  const st = s.strategy;
  const meta = [MODE[st.mode], `$${st.tradeUsd} per trade`, `${st.edgeBps} bps edge`, `every ${st.loopSeconds}s`, `${a.operatorGasHsk.toFixed(3)} HSK gas`];
  return (
    <Panel title="Agent" right={<span className="text-xs text-white/45">{meta.join(" · ")}</span>}>
      {a.simulateOnly && <p className="mb-3 text-xs text-amber-300">Simulate-only mode: decisions are checked against the vault but never sent.</p>}
      {a.lastError && <p className="mb-3 rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">Last error: {a.lastError}</p>}
      <ul className="divide-y divide-white/[0.06] border-t border-white/10">
        {a.decisions.map((d, i) => (
          <li key={i} className="grid grid-cols-[3.5rem_3rem_1fr] gap-x-3 py-3 text-sm">
            <span className="font-medium">{d.sym}</span>
            <span className={`font-semibold uppercase ${tone[d.action]}`}>{d.action}</span>
            <div className="min-w-0">
              <p className="text-white/80">{d.reason}</p>
              {d.ref !== undefined && (
                <p className="mt-1 text-xs text-white/40 tabular-nums">
                  ref {num(d.ref, 5)} · pool ask {num(d.buy ?? 0, 5)} · pool bid {num(d.sell ?? 0, 5)} · oracle {num(d.oracle ?? 0, 5)}
                </p>
              )}
            </div>
          </li>
        ))}
        {a.decisions.length === 0 && <li className="py-3 text-sm text-white/40">Waiting for the first check. The agent looks at the market every {st.loopSeconds}s.</li>}
      </ul>
    </Panel>
  );
}
