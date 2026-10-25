"use client";

import { useState } from "react";
import { BaseError, type Hash } from "viem";
import { waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "./config";

export type TxStatus = { busy: string | null; result: { ok: boolean; text: string; hash?: string } | null };

/** Runs owner transactions one after another (e.g. approve then deposit), waiting for each receipt. */
export function useVaultTx(onDone?: () => void) {
  const [status, setStatus] = useState<TxStatus>({ busy: null, result: null });

  async function send(label: string, ...steps: Array<() => Promise<Hash>>) {
    setStatus({ busy: label, result: null });
    let hash: Hash | undefined;
    try {
      for (const step of steps) {
        hash = await step();
        const r = await waitForTransactionReceipt(wagmiConfig, { hash });
        if (r.status === "reverted") throw new Error("transaction reverted");
      }
      setStatus({ busy: null, result: { ok: true, text: `${label}: confirmed`, hash } });
      onDone?.();
    } catch (e) {
      const text = e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e);
      setStatus({ busy: null, result: { ok: false, text: `${label}: ${text}`, hash } });
    }
  }
  return { ...status, send };
}
