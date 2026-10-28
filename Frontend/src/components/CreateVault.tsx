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
    <section className="mt-6 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-5" aria-labelledby="create-vault">
      <h2 id="create-vault" className="text-base font-semibold">Create your vault</h2>
      <p className="mt-2 max-w-2xl text-sm text-white/65">
        A vault is a contract on HSK Chain that holds your money and is owned by this wallet. Only you can deposit, withdraw, pause or change its rules.
        The AI agent can trade inside those rules but can never withdraw, and it pays its own gas.
      </p>
      {p && (
        <p className="mt-2 text-sm text-white/65">
          It starts with a {usd(Number(p.maxTradeUsd) / 1e8)} max trade and a {pct(p.dailyLossCapBps)} daily loss cap. You can change both after creating it, here or in chat.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!!tx.busy} onClick={() => tx.send("Create vault", () => writeContract(wagmiConfig, { ...factory, chainId: hashkey.id, functionName: "createVault" }))}>
          {tx.busy ? "Confirm in wallet…" : "Create my vault"}
        </Button>
        <span className="text-xs text-white/45">One transaction, about 1 HSK in gas. Then deposit USDT or WHSK.</span>
      </div>
      <TxResult result={tx.result} />
    </section>
  );
}
