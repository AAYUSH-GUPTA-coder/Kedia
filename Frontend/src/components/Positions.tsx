import type { State } from "@/lib/api";
import { num, usd } from "@/lib/api";
import { Panel } from "./ui";

export function Positions({ s }: { s: State }) {
  return (
    <Panel title="Positions">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-left text-xs text-white/40">
          <tr><th className="pb-2 font-normal">Token</th><th className="pb-2 text-right font-normal">Balance</th><th className="pb-2 text-right font-normal">Oracle price</th><th className="pb-2 text-right font-normal">Value</th><th className="pb-2 text-right font-normal">Status</th></tr>
        </thead>
        <tbody>
          {s.vault.positions.map((p) => (
            <tr key={p.sym} className="border-t border-white/5">
              <td className="py-2 font-medium">{p.sym}</td>
              <td className="py-2 text-right">{num(p.balance)}</td>
              <td className="py-2 text-right text-white/60">{p.price ? `$${num(p.price, p.price < 1 ? 5 : 2)}` : "–"}</td>
              <td className="py-2 text-right">{usd(p.usd)}</td>
              <td className="py-2 text-right">
                <span className={`rounded px-1.5 py-0.5 text-xs ${p.allowed ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/50"}`}>{p.allowed ? "tradable" : "blocked"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
