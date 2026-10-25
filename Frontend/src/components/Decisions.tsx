import type { State } from "@/lib/api";
import { num } from "@/lib/api";
import { Panel } from "./ui";

const tone = { buy: "text-emerald-400", sell: "text-amber-400", hold: "text-white/50" };

export function Decisions({ s }: { s: State }) {
  const a = s.agent;
  const ago = a.lastTickAt ? Math.round((Date.now() - a.lastTickAt) / 1000) : null;
  return (
    <Panel
      title="Agent"
      right={<span className="text-xs text-white/40">{s.strategy.mode} · ${s.strategy.tradeUsd}/trade · edge {s.strategy.edgeBps}bps · every {s.strategy.loopSeconds}s{ago !== null ? ` · ${ago}s ago` : ""}</span>}
    >
      {a.simulateOnly && <p className="mb-2 text-xs text-amber-300">Simulate-only mode: decisions are checked against the vault but never sent.</p>}
      {a.lastError && <p className="mb-2 text-xs text-rose-400">Last error: {a.lastError}</p>}
      <ul className="space-y-2 text-sm">
        {a.decisions.map((d, i) => (
          <li key={i} className="flex gap-3">
            <span className="w-12 shrink-0 font-medium">{d.sym}</span>
            <span className={`w-10 shrink-0 font-semibold uppercase ${tone[d.action]}`}>{d.action}</span>
            <span className="text-white/70">
              {d.reason}
              {d.ref !== undefined && (
                <span className="block text-xs text-white/40 tabular-nums">
                  ref {num(d.ref, 5)} · pool ask {num(d.buy ?? 0, 5)} · pool bid {num(d.sell ?? 0, 5)} · oracle {num(d.oracle ?? 0, 5)}
                </span>
              )}
            </span>
          </li>
        ))}
        {a.decisions.length === 0 && <li className="text-white/40">Waiting for the first tick…</li>}
      </ul>
    </Panel>
  );
}
