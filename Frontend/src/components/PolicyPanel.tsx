"use client";

import { useState } from "react";
import { erc20Abi, parseUnits, type Address } from "viem";
import { writeContract } from "wagmi/actions";
import { cfg, SYMS, vaultAt, wagmiConfig, type Sym } from "@/lib/config";
import { api, fmtError, pct, usd, type State } from "@/lib/api";
import { parsePolicyForm, proposalCalls, toPolicyForm, type PolicyForm } from "@/lib/policy";
import { useVaultTx } from "@/lib/useVaultTx";
import { Button, field, Panel, TxResult } from "./ui";

export function PolicyPanel({ s, isOwner, refresh }: { s: State; isOwner: boolean; refresh: () => void }) {
  const p = s.vault.policy;
  const vault = vaultAt(s.vault.address as Address);
  const tx = useVaultTx(refresh);
  const [sym, setSym] = useState<Sym>("USDT");
  const [amount, setAmount] = useState("");
  const [breach, setBreach] = useState<{ busy: boolean; text?: string }>({ busy: false });
  const [form, setForm] = useState<PolicyForm | null>(null);
  const policyTx = useVaultTx(refresh);
  const allowedNow = s.vault.positions.filter((x) => x.allowed).map((x) => x.sym);
  const token = { address: cfg.tokens[sym].address as Address, decimals: cfg.tokens[sym].decimals };
  const raw = () => parseUnits(amount || "0", token.decimals);

  const rows: [string, string][] = [
    ["Max trade size", usd(p.maxTradeUsd)],
    ["Daily loss cap (stop-loss)", pct(p.dailyLossCapBps)],
    ["Max fill vs oracle shortfall", pct(p.maxOracleDeviationBps)],
    ["Cooldown between trades", p.cooldownSeconds ? `${p.cooldownSeconds}s` : "Off"],
    ["Max oracle age", `${Math.round(p.maxOracleAge / 3600)}h`],
    ["Tradable tokens", allowedNow.join(", ") || "none"],
  ];

  const parsed = form && parsePolicyForm(form);
  const edit = (k: keyof PolicyForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => f && { ...f, [k]: e.target.value });
  const toggle = (sym: string) => setForm((f) => f && { ...f, allowedTokens: f.allowedTokens.includes(sym) ? f.allowedTokens.filter((x) => x !== sym) : [...f.allowedTokens, sym] });

  function apply() {
    if (!parsed || "error" in parsed) return;
    const tokens = s.vault.positions.map((x) => ({ sym: x.sym, address: x.address as Address, allowed: x.allowed, feed: x.feed as Address }));
    const calls = proposalCalls(parsed.policy, tokens, cfg.feeds);
    void policyTx.send("Update policy", () => writeContract(wagmiConfig, { ...vault, functionName: "multicall", args: [calls] })).then((ok) => ok && setForm(null));
  }

  async function tryBreach() {
    setBreach({ busy: true });
    try {
      const r = await api.trade({ symbol: "WHSK", side: "buy", amount: p.maxTradeUsd * 10, unit: "usd" });
      setBreach({ busy: false, text: r.error ? `Vault rejected it on-chain: ${fmtError(r.error)}` : `Executed?! ${r.kind}` });
    } catch (e) {
      setBreach({ busy: false, text: e instanceof Error ? e.message : String(e) });
    }
    refresh();
  }

  return (
    <Panel
      title="On-chain policy"
      right={
        <div className="flex items-center gap-2">
          {s.vault.paused && <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-xs font-medium text-rose-300">Paused</span>}
          {!form && <Button disabled={!isOwner || !!policyTx.busy} onClick={() => setForm(toPolicyForm(p, allowedNow))}>Edit</Button>}
        </div>
      }
    >
      {form ? (
        <form onSubmit={(e) => { e.preventDefault(); apply(); }}>
          <div className="divide-y divide-white/[0.06] border-t border-white/10 text-sm">
            <Field label="Max trade size" prefix="$" value={form.maxTradeUsd} onChange={edit("maxTradeUsd")} />
            <Field label="Daily loss cap (stop-loss)" suffix="%" value={form.dailyLossCapPct} onChange={edit("dailyLossCapPct")} />
            <Field label="Max fill vs oracle shortfall" suffix="%" value={form.maxOracleDeviationPct} onChange={edit("maxOracleDeviationPct")} />
            <Field label="Cooldown between trades" suffix="s" hint="0 turns it off" value={form.cooldownSeconds} onChange={edit("cooldownSeconds")} />
            <Field label="Max oracle age" suffix="h" value={form.maxOracleAgeHours} onChange={edit("maxOracleAgeHours")} />
            <fieldset className="flex items-center justify-between gap-4 py-2">
              <legend className="sr-only">Tradable tokens</legend>
              <span aria-hidden className="text-white/55">Tradable tokens</span>
              <div className="flex gap-3">
                {s.vault.positions.map((x) => (
                  <label key={x.sym} className="inline-flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" aria-label={`Allow ${x.sym}`} checked={form.allowedTokens.includes(x.sym)} onChange={() => toggle(x.sym)} className="accent-emerald-400" />
                    {x.sym}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {parsed && "error" in parsed && <p className="mt-3 text-xs text-rose-300" role="alert">{parsed.error}</p>}
          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="primary" disabled={!!policyTx.busy || !parsed || "error" in parsed}>{policyTx.busy ? "Confirm in wallet…" : "Sign & apply"}</Button>
            <Button type="button" onClick={() => setForm(null)} disabled={!!policyTx.busy}>Cancel</Button>
          </div>
          <p className="mt-2 text-xs text-white/45">One signature updates the limits and the token list together.</p>
        </form>
      ) : (
        <dl className="divide-y divide-white/[0.06] border-t border-white/10 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-white/55">{k}</dt>
              <dd className="text-right tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {!form && <p className="mt-3 text-xs text-white/45">Enforced by the vault contract. {isOwner ? "Edit it here or ask in chat." : "Only the owner wallet can change it; connect it to edit. The agent's key cannot."}</p>}
      <TxResult result={policyTx.result} />

      {isOwner && <div className="mt-6">
        <h3 className="text-sm font-semibold">Guardrail demo</h3>
        <p className="mt-1 text-xs text-white/55">Asks the agent to buy {usd(p.maxTradeUsd * 10)} of WHSK, 10× the limit. The transaction is sent anyway so the revert is visible on-chain.</p>
        <div className="mt-3"><Button variant="danger" onClick={tryBreach} disabled={breach.busy}>{breach.busy ? "Sending…" : "Try to trade 10× the limit"}</Button></div>
        {breach.text && <p className="mt-2 font-mono text-xs text-rose-300">{breach.text}</p>}
      </div>}

      {isOwner && (
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold">Owner actions</h3>
          <div>
            {s.vault.paused
              ? <Button variant="primary" disabled={!!tx.busy} onClick={() => tx.send("Unpause", () => writeContract(wagmiConfig, { ...vault, functionName: "unpause" }))}>Unpause trading</Button>
              : <Button variant="danger" disabled={!!tx.busy} onClick={() => tx.send("Pause", () => writeContract(wagmiConfig, { ...vault, functionName: "pause" }))}>Pause trading</Button>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Token" value={sym} onChange={(e) => setSym(e.target.value as Sym)} className={field}>
              {SYMS.map((x) => <option key={x}>{x}</option>)}
            </select>
            <input aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount" className={`w-28 ${field}`} />
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

function Field({ label, prefix, suffix, hint, value, onChange }: { label: string; prefix?: string; suffix?: string; hint?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-white/55">{label}{hint && <span className="block text-xs text-white/35">{hint}</span>}</span>
      <span className={`flex w-28 items-center rounded-lg border border-white/15 bg-black px-2 focus-within:border-white/40`}>
        {prefix && <span className="text-white/40">{prefix}</span>}
        <input aria-label={label} value={value} onChange={onChange} inputMode="decimal" className="w-full min-w-0 bg-transparent py-1.5 text-right tabular-nums focus:outline-none" />
        {suffix && <span className="pl-1 text-white/40">{suffix}</span>}
      </span>
    </label>
  );
}
