"use client";

import { useState } from "react";
import { api, fmtError, usd, type LogEntry, type State } from "@/lib/api";
import { Button, Tag, TxLink } from "./ui";

/** The demo's main moment: ask for a trade 10× the limit and watch the vault refuse it on-chain. */
export function GuardrailDemo({ s, isOwner, refresh }: { s: State; isOwner: boolean; refresh: () => void }) {
  const max = s.vault.policy.maxTradeUsd;
  const [r, setR] = useState<{ busy: boolean; entry?: LogEntry; error?: string }>({ busy: false });

  async function attempt() {
    setR({ busy: true });
    try {
      setR({ busy: false, entry: await api.trade({ symbol: "WHSK", side: "buy", amount: max * 10, unit: "usd" }) });
    } catch (e) {
      setR({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
    refresh();
  }

  return (
    <section aria-labelledby="guardrail-title" className="relative overflow-hidden rounded-xl border border-down/30 bg-panel">
      <div aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-down" />
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="guardrail-title" className="text-sm font-medium tracking-tight">Try to break the rules</h2>
          <Tag tone="bad">Guardrail demo</Tag>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Ask the agent to buy <span className="font-mono text-fg">{usd(max * 10)}</span> of WHSK, 10× this vault&apos;s <span className="font-mono text-fg">{usd(max)}</span> max trade. The transaction is sent anyway, so you can watch the vault refuse it on-chain.
        </p>
        <div className="mt-3">
          <Button variant="danger" onClick={() => void attempt()} disabled={!isOwner || r.busy}>{r.busy ? "Sending…" : `Try to buy ${usd(max * 10)}`}</Button>
        </div>
        {!isOwner && <p className="mt-2 text-xs text-faint">Connect the wallet that owns this vault to try it.</p>}

        {r.entry?.kind === "rejected" && (
          <div role="status" className="mt-3 rounded-lg border border-down/30 bg-down/10 p-3">
            <p className="text-sm font-semibold text-down">Blocked on-chain</p>
            <p className="mt-1 font-mono text-xs text-down">{fmtError(r.entry.error)}</p>
            <p className="mt-1.5 text-xs text-muted">Nothing left the vault. {r.entry.txHash && <>See the reverted transaction: <TxLink hash={r.entry.txHash} /></>}</p>
          </div>
        )}
        {r.entry && r.entry.kind !== "rejected" && <p role="status" className="mt-3 text-xs text-warn">The vault accepted it ({r.entry.kind}). Check the max trade size in the policy.</p>}
        {r.error && <p role="alert" className="mt-3 text-xs text-down">{r.error}</p>}
      </div>
    </section>
  );
}
