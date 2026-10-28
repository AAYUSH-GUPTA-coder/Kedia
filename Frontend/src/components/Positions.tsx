import type { State } from "@/lib/api";
import { num, usd } from "@/lib/api";
import { Dot, Panel } from "./ui";

export function Positions({ s }: { s: State }) {
  return (
    <Panel title="Positions">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-left text-xs text-white/45">
          <tr><th className="pb-2 font-normal">Token</th><th className="pb-2 text-right font-normal">Balance</th><th className="pb-2 text-right font-normal">Oracle price</th><th className="pb-2 text-right font-normal">Value</th><th className="pb-2 pl-6 text-left font-normal">Status</th></tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06] border-t border-white/10">
          {s.vault.positions.map((p) => (
            <tr key={p.sym}>
              <td className="py-2.5 font-medium">{p.sym}</td>
              <td className="py-2.5 text-right">{num(p.balance)}</td>
              <td className="py-2.5 text-right text-white/60">{p.price ? `$${num(p.price, p.price < 1 ? 5 : 2)}` : "–"}</td>
              <td className="py-2.5 text-right">{usd(p.usd)}</td>
              <td className="py-2.5 pl-6 text-xs">
                <span className={`inline-flex items-center gap-1.5 ${p.allowed ? "text-emerald-300" : "text-white/50"}`}><Dot tone={p.allowed ? "good" : "muted"} />{p.allowed ? "Tradable" : "Blocked"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
