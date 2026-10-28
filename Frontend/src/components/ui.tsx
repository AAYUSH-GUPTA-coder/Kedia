import type { ReactNode } from "react";
import { explorerTx } from "@/lib/config";

/** A titled section. Chrome comes from the parent (open content plane or bordered rail). */
export function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Metric({ label, value, sub, tone, lead, children }: { label: string; value: string; sub?: ReactNode; tone?: "good" | "bad"; lead?: boolean; children?: ReactNode }) {
  const color = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : "text-white";
  return (
    <div>
      <div className="text-xs text-white/50">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums tracking-tight ${lead ? "text-3xl" : "text-2xl"} ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-white/45">{sub}</div>}
      {children}
    </div>
  );
}

export function Button({ children, onClick, disabled, type, variant = "default" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; variant?: "default" | "primary" | "danger" }) {
  const styles = {
    default: "border-white/15 bg-white/5 hover:bg-white/10",
    primary: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25",
    danger: "border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`rounded-lg border px-3 py-1.5 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}>
      {children}
    </button>
  );
}

export const field = "rounded-lg border border-white/15 bg-black px-3 py-2 text-sm placeholder:text-white/40 focus:border-white/40 focus:outline-none";

export function Dot({ tone }: { tone: "good" | "bad" | "warn" | "muted" }) {
  const c = { good: "bg-emerald-400", bad: "bg-rose-400", warn: "bg-amber-400", muted: "bg-white/30" }[tone];
  return <span aria-hidden className={`inline-block size-1.5 shrink-0 rounded-full ${c}`} />;
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
