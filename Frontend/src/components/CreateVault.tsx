"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseEther } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { writeContract } from "wagmi/actions";
import { api, pct, usd } from "@/lib/api";
import { chain, factory, TESTNET, wagmiConfig } from "@/lib/config";
import { useVaultTx } from "@/lib/useVaultTx";
import { TestTokens } from "./TestTokens";
import { Button, field, TxResult } from "./ui";

/** Shown to a connected wallet that has no vault yet. One transaction creates a vault this wallet owns and funds its agent wallet. */
export function CreateVault({ onCreated }: { onCreated: () => void }) {
  const tx = useVaultTx(onCreated);
  const { address } = useConnection();
  const p = useReadContract({ ...factory, chainId: chain.id, functionName: "defaultPolicy" }).data;
  const agent = useQuery({ queryKey: ["agent", address], queryFn: () => api.agent(address!), enabled: !!address });
  const [gas, setGas] = useState(TESTNET ? "0.05" : "5"); // testnet gas is about 500x cheaper
  const gasOk = /^\d*\.?\d+$/.test(gas.trim());
  return (
    <section className="relative overflow-hidden rounded-xl border border-accent/25 bg-panel" aria-labelledby="create-vault">
      <div aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
      <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-10">
        <div>
          <h2 id="create-vault" className="text-base font-semibold tracking-tight">Create your vault</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            A vault is a contract on HSK Chain that holds your money and is owned by this wallet. Only you can deposit, withdraw, pause or change its rules.
            Your vault gets its own AI agent wallet. The agent can trade inside your rules but can never withdraw, and it pays for its trades with the HSK you give it.
          </p>
          {p && (
            <p className="mt-2 text-sm text-muted">
              It starts with a <span className="font-mono text-fg">{usd(Number(p.maxTradeUsd) / 1e8)}</span> max trade and a <span className="font-mono text-fg">{pct(p.dailyLossCapBps)}</span> daily loss cap. You can change both after creating it, here or in chat.
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <label className="flex items-center gap-2 text-xs text-muted">
            Agent gas
            <input aria-label="HSK for the agent's gas" value={gas} onChange={(e) => setGas(e.target.value)} inputMode="decimal" className={`w-20 text-right font-mono ${field}`} />
            HSK
          </label>
          <Button variant="primary" disabled={!!tx.busy || !agent.data || !gasOk} onClick={() => tx.send("Create vault", () => writeContract(wagmiConfig, {
            ...factory, chainId: chain.id, functionName: "createVault", args: [agent.data!.address], value: parseEther(gas.trim()),
          }))}>
            {tx.busy ? "Confirm in wallet…" : "Create my vault"}
          </Button>
          <span className="text-xs text-faint md:text-right">One transaction: a little HSK to create, plus the agent&apos;s gas.<br className="hidden md:block" /> Top it up or take it back any time. Then deposit USDT or WHSK.</span>
          {agent.error && <span className="text-xs text-down">Backend unreachable: {agent.error.message}</span>}
        </div>
      </div>
      {TESTNET && <div className="border-t border-line px-5 py-3 sm:px-6"><TestTokens /></div>}
      {tx.result && <div className="px-5 pb-4 sm:px-6"><TxResult result={tx.result} /></div>}
    </section>
  );
}
