import type { ReactNode } from "react";
import { explorerTx } from "@/lib/config";

/** Small uppercase mono label used for metric and column captions. */
export const label = "font-mono text-2xs uppercase tracking-label text-faint";

/** A contained section: header bar with title and optional right slot, padded body unless `flush`. */
export function Panel({ title, right, flush, fill, children }: { title: string; right?: ReactNode; flush?: boolean; fill?: boolean; children: ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-line bg-panel ${fill ? "flex h-full flex-col" : ""}`}>
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2">
        <h2 className="text-sm font-medium tracking-tight">{title}</h2>
        {right}
      </header>
      <div className={`${flush ? "" : "p-4"} ${fill ? "min-h-0 flex-1" : ""}`}>{children}</div>
    </section>
  );
}

export function Button({ children, onClick, disabled, type, variant = "default" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; variant?: "default" | "primary" | "danger" }) {
  const styles = {
    default: "border-line-strong bg-raised text-fg hover:border-fg/25",
    primary: "border-transparent bg-fg text-canvas hover:bg-white",
    danger: "border-down/35 bg-down/10 text-down hover:bg-down/20",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}>
      {children}
    </button>
  );
}

export const field = "rounded-md border border-line-strong bg-canvas px-3 py-2 text-sm text-fg placeholder:text-faint transition-colors focus:border-accent/70 focus:outline-none";

type Tone = "good" | "bad" | "warn" | "muted";

export function Dot({ tone }: { tone: Tone }) {
  const c = { good: "bg-up", bad: "bg-down", warn: "bg-warn", muted: "bg-faint" }[tone];
  return <span aria-hidden className={`inline-block size-1.5 shrink-0 rounded-full ${c}`} />;
}

/** Compact status pill. */
export function Tag({ tone = "muted", children }: { tone?: Tone | "accent"; children: ReactNode }) {
  const c = { good: "bg-up/10 text-up", bad: "bg-down/10 text-down", warn: "bg-warn/10 text-warn", muted: "bg-raised text-muted", accent: "bg-accent/10 text-accent" }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-2xs font-medium uppercase tracking-label ${c}`}>{children}</span>;
}

export function TxLink({ hash }: { hash?: string }) {
  if (!hash) return null;
  return (
    <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg hover:decoration-fg/40">
      {hash.slice(0, 8)}…{hash.slice(-4)}
    </a>
  );
}

export function TxResult({ result }: { result: { ok: boolean; text: string; hash?: string } | null }) {
  if (!result) return null;
  return (
    <p className={`mt-2 text-xs ${result.ok ? "text-up" : "text-down"}`}>
      {result.text} <TxLink hash={result.hash} />
    </p>
  );
}

/** A labelled number input for the settings forms. */
export function Field({ label, prefix, suffix, hint, value, onChange }: { label: string; prefix?: string; suffix?: string; hint?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-muted">{label}{hint && <span className="block text-xs text-faint">{hint}</span>}</span>
      <span className="flex w-28 items-center rounded-md border border-line-strong bg-canvas px-2 transition-colors focus-within:border-accent/70">
        {prefix && <span className="text-faint">{prefix}</span>}
        <input aria-label={label} value={value} onChange={onChange} inputMode="decimal" className="w-full min-w-0 bg-transparent py-1.5 text-right font-mono tabular-nums focus:outline-none" />
        {suffix && <span className="pl-1 text-faint">{suffix}</span>}
      </span>
    </label>
  );
}
