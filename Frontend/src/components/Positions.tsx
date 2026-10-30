import type { State } from "@/lib/api";
import { amount, num, usd } from "@/lib/api";
import { Dot, label, Panel } from "./ui";

export function Positions({ s }: { s: State }) {
  const total = s.vault.positions.reduce((a, p) => a + p.usd, 0);
  const th = `pb-2 pt-3 font-normal ${label}`;
  return (
    <Panel flush title="Positions" right={<span className="text-xs text-faint">{s.vault.positions.length} tokens · oracle-marked</span>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr>
              <th className={`${th} pl-4`}>Token</th>
              <th className={`${th} text-right`}>Balance</th>
              <th className={`${th} text-right`}>Price</th>
              <th className={`${th} text-right`}>Value</th>
              <th className={`${th} hidden pl-6 sm:table-cell`}>Weight</th>
              <th className={`${th} pr-4 pl-6`}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line font-mono tabular-nums">
            {s.vault.positions.map((p) => {
              const w = total ? p.usd / total : 0;
              return (
                <tr key={p.sym} className="transition-colors hover:bg-raised/50">
                  <td className="py-3 pl-4 font-sans font-medium">{p.sym}</td>
                  <td className="py-3 pl-4 text-right">{amount(p.balance, p.sym)}</td>
                  <td className="py-3 pl-4 text-right text-muted">{p.price ? `$${num(p.price, p.price < 1 ? 5 : 2)}` : "–"}</td>
                  <td className="py-3 pl-4 text-right">{usd(p.usd)}</td>
                  <td className="hidden py-3 pl-6 sm:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-fg/45" style={{ width: `${w * 100}%` }} /></div>
                      <span className="w-9 text-right text-xs text-muted">{Math.round(w * 100)}%</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 pl-6 font-sans text-xs">
                    <span className={`inline-flex items-center gap-1.5 ${p.allowed ? "text-muted" : "text-faint"}`}><Dot tone={p.allowed ? "good" : "muted"} />{p.allowed ? "Tradable" : "Blocked"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
