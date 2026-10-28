import type { State } from "@/lib/api";
import { num } from "@/lib/api";
import { label, Panel, Tag } from "./ui";

const TONE = { buy: "good", sell: "bad", hold: "muted" } as const;
const MODE = { meanReversion: "Mean reversion", momentum: "Momentum", off: "Off" };

export function Decisions({ s }: { s: State }) {
  const a = s.agent;
  const st = s.strategy;
  const stats: [string, string][] = [
    ["Per trade", `$${st.tradeUsd}`],
    ["Edge", `${st.edgeBps} bps`],
    ["Checks every", `${st.loopSeconds}s`],
    ["Min gap", `${a.cooldownSeconds / 60} min`],
    ["Gas left", `${a.operatorGasHsk.toFixed(3)} HSK`],
  ];
  return (
    <Panel flush title="Agent" right={<Tag tone={st.mode === "off" ? "muted" : "accent"}>{MODE[st.mode]}</Tag>}>
      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-5">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-panel px-4 py-3 last:col-span-2 sm:last:col-span-1">
            <dt className={label}>{k}</dt>
            <dd className="mt-1 font-mono text-sm tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {a.simulateOnly && <p className="border-b border-line bg-warn/5 px-4 py-2.5 text-xs text-warn">Simulate-only mode: decisions are checked against the vault but never sent.</p>}
      {a.lastError && <p className="border-b border-line bg-down/5 px-4 py-2.5 font-mono text-xs text-down">Last error: {a.lastError}</p>}
      <ul className="divide-y divide-line">
        {a.decisions.map((d, i) => (
          <li key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-[3.5rem_3.5rem_minmax(0,1fr)]">
            <span className="font-medium">{d.sym}</span>
            <span><Tag tone={TONE[d.action]}>{d.action}</Tag></span>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <p>{d.reason}</p>
              {d.ref !== undefined && (
                <p className="mt-1 font-mono text-xs text-faint tabular-nums">
                  ref {num(d.ref, 5)} · ask {num(d.buy ?? 0, 5)} · bid {num(d.sell ?? 0, 5)} · oracle {num(d.oracle ?? 0, 5)}
                </p>
              )}
            </div>
          </li>
        ))}
        {a.decisions.length === 0 && <li className="px-4 py-4 text-sm text-faint">Waiting for the first check. The agent looks at the market every {st.loopSeconds}s.</li>}
      </ul>
    </Panel>
  );
}
