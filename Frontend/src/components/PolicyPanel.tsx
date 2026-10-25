"use client";

import { useState } from "react";
import { erc20Abi, parseUnits, type Address } from "viem";
import { writeContract } from "wagmi/actions";
import { cfg, SYMS, vault, wagmiConfig, type Sym } from "@/lib/config";
import { api, fmtError, pct, usd, type State } from "@/lib/api";
import { useVaultTx } from "@/lib/useVaultTx";
import { Button, Panel, TxResult } from "./ui";

export function PolicyPanel({ s, isOwner, refresh }: { s: State; isOwner: boolean; refresh: () => void }) {
  const p = s.vault.policy;
  const tx = useVaultTx(refresh);
  const [sym, setSym] = useState<Sym>("USDT");
  const [amount, setAmount] = useState("");
  const [breach, setBreach] = useState<{ busy: boolean; text?: string }>({ busy: false });
  const token = { address: cfg.tokens[sym].address as Address, decimals: cfg.tokens[sym].decimals };
  const raw = () => parseUnits(amount || "0", token.decimals);

  const rows: [string, string][] = [
    ["Max trade size", usd(p.maxTradeUsd)],
    ["Daily loss cap (stop-loss)", pct(p.dailyLossCapBps)],
    ["Max fill vs oracle shortfall", pct(p.maxOracleDeviationBps)],
    ["Cooldown between trades", `${p.cooldownSeconds}s`],
    ["Max oracle age", `${Math.round(p.maxOracleAge / 3600)}h`],
    ["Tradable tokens", s.vault.positions.filter((x) => x.allowed).map((x) => x.sym).join(", ") || "none"],
  ];

  async function tryBreach() {
    setBreach({ busy: true });
    try {
      const r = await api.trade({ symbol: "WHSK", side: "buy", usd: p.maxTradeUsd * 10 });
      setBreach({ busy: false, text: r.error ? `Vault rejected it on-chain: ${fmtError(r.error)}` : `Executed?! ${r.kind}` });
    } catch (e) {
      setBreach({ busy: false, text: e instanceof Error ? e.message : String(e) });
    }
    refresh();
  }

  return (
    <Panel title="On-chain policy" right={s.vault.paused ? <span className="rounded bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">PAUSED</span> : null}>
      <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-white/50">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-white/40">Enforced by the vault contract. Only the owner wallet can change it; the agent's key cannot.</p>

      <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
        <div className="text-sm font-medium">Guardrail demo</div>
        <p className="mt-1 text-xs text-white/50">Asks the agent to buy {usd(p.maxTradeUsd * 10)} of WHSK, 10× the limit. The transaction is sent anyway so the revert is visible on-chain.</p>
        <div className="mt-2"><Button variant="danger" onClick={tryBreach} disabled={breach.busy}>{breach.busy ? "Sending…" : "Try to trade 10× the limit"}</Button></div>
        {breach.text && <p className="mt-2 font-mono text-xs text-rose-300">{breach.text}</p>}
      </div>

      {isOwner && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <div className="flex flex-wrap gap-2">
            {s.vault.paused
              ? <Button variant="primary" disabled={!!tx.busy} onClick={() => tx.send("Unpause", () => writeContract(wagmiConfig, { ...vault, functionName: "unpause" }))}>Unpause trading</Button>
              : <Button variant="danger" disabled={!!tx.busy} onClick={() => tx.send("Pause", () => writeContract(wagmiConfig, { ...vault, functionName: "pause" }))}>Pause trading</Button>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={sym} onChange={(e) => setSym(e.target.value as Sym)} className="rounded-lg border border-white/15 bg-black px-2 py-1.5 text-sm">
              {SYMS.map((x) => <option key={x}>{x}</option>)}
            </select>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount" className="w-28 rounded-lg border border-white/15 bg-black px-2 py-1.5 text-sm" />
            <Button disabled={!!tx.busy || !Number(amount)} onClick={() => tx.send(`Deposit ${amount} ${sym}`,
              () => writeContract(wagmiConfig, { address: token.address, abi: erc20Abi, functionName: "approve", args: [vault.address, raw()] }),
              () => writeContract(wagmiConfig, { ...vault, functionName: "deposit", args: [token.address, raw()] }))}>Deposit</Button>
            <Button disabled={!!tx.busy || !Number(amount)} onClick={() => tx.send(`Withdraw ${amount} ${sym}`,
              () => writeContract(wagmiConfig, { ...vault, functionName: "withdraw", args: [token.address, raw(), s.vault.owner as Address] }))}>Withdraw</Button>
          </div>
          {tx.busy && <p className="text-xs text-white/50">{tx.busy}: confirm in your wallet…</p>}
          <TxResult result={tx.result} />
        </div>
      )}
    </Panel>
  );
}
