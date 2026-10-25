import type { ReactNode } from "react";
import { explorerTx } from "@/lib/config";

export function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs text-white/50">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-white/40">{sub}</div>}
    </div>
  );
}

export function Button({ children, onClick, disabled, variant = "default" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; variant?: "default" | "primary" | "danger" }) {
  const styles = {
    default: "border-white/15 bg-white/5 hover:bg-white/10",
    primary: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25",
    danger: "border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25",
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}>
      {children}
    </button>
  );
}

export function TxLink({ hash }: { hash?: string }) {
  if (!hash) return null;
  return (
    <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-sky-400 hover:underline">
      {hash.slice(0, 10)}…
    </a>
  );
}

export function TxResult({ result }: { result: { ok: boolean; text: string; hash?: string } | null }) {
  if (!result) return null;
  return (
    <p className={`mt-2 text-xs ${result.ok ? "text-emerald-400" : "text-rose-400"}`}>
      {result.text} <TxLink hash={result.hash} />
    </p>
  );
}
