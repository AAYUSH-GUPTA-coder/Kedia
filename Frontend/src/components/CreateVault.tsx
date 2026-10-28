"use client";

import { useReadContract } from "wagmi";
import { writeContract } from "wagmi/actions";
import { hashkey } from "wagmi/chains";
import { pct, usd } from "@/lib/api";
import { factory, wagmiConfig } from "@/lib/config";
import { useVaultTx } from "@/lib/useVaultTx";
import { Button, TxResult } from "./ui";

/** Shown to a connected wallet that has no vault yet. One transaction creates a vault this wallet owns. */
export function CreateVault({ onCreated }: { onCreated: () => void }) {
  const tx = useVaultTx(onCreated);
  const p = useReadContract({ ...factory, chainId: hashkey.id, functionName: "defaultPolicy" }).data;
  return (
    <section className="relative overflow-hidden rounded-xl border border-accent/25 bg-panel" aria-labelledby="create-vault">
      <div aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
      <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-10">
        <div>
          <h2 id="create-vault" className="text-base font-semibold tracking-tight">Create your vault</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            A vault is a contract on HSK Chain that holds your money and is owned by this wallet. Only you can deposit, withdraw, pause or change its rules.
            The AI agent can trade inside those rules but can never withdraw, and it pays its own gas.
          </p>
          {p && (
            <p className="mt-2 text-sm text-muted">
              It starts with a <span className="font-mono text-fg">{usd(Number(p.maxTradeUsd) / 1e8)}</span> max trade and a <span className="font-mono text-fg">{pct(p.dailyLossCapBps)}</span> daily loss cap. You can change both after creating it, here or in chat.
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Button variant="primary" disabled={!!tx.busy} onClick={() => tx.send("Create vault", () => writeContract(wagmiConfig, { ...factory, chainId: hashkey.id, functionName: "createVault" }))}>
            {tx.busy ? "Confirm in wallet…" : "Create my vault"}
          </Button>
          <span className="text-xs text-faint md:text-right">One transaction, about 1 HSK in gas.<br className="hidden md:block" /> Then deposit USDT or WHSK.</span>
        </div>
      </div>
      {tx.result && <div className="px-5 pb-4 sm:px-6"><TxResult result={tx.result} /></div>}
    </section>
  );
}
