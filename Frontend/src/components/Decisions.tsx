"use client";

import { useState } from "react";
import { parseEther, type Address } from "viem";
import { sendTransaction } from "wagmi/actions";
import type { State, Strategy } from "@/lib/api";
import { api, num, pct } from "@/lib/api";
import { explorerAddr, SYMS, wagmiConfig } from "@/lib/config";
import { useVaultTx } from "@/lib/useVaultTx";
import { Button, Field, field, label, Panel, Tag, TxResult } from "./ui";

const TONE = { buy: "good", sell: "bad", hold: "muted" } as const;
const ACTION = { buy: "Buy", sell: "Sell", hold: "Wait" };
const MODE = { meanReversion: "Mean reversion", momentum: "Momentum", off: "Off" };
const ASSETS = SYMS.filter((x) => x !== "USDT"); // what the agent can buy and sell for USDT
const gap = (s: number) => (s === 0 ? "Off" : s % 60 ? `${s}s` : `${s / 60} min`);

// Edge and slippage are edited as percents; the backend stores basis points (100 bps = 1%).
type Form = { mode: Strategy["mode"]; symbols: Strategy["symbols"]; tradeUsd: string; edgePct: string; slippagePct: string; loopSeconds: string; minGapMinutes: string };
const toForm = (st: Strategy): Form => ({
  mode: st.mode, symbols: st.symbols, tradeUsd: String(st.tradeUsd), edgePct: String(st.edgeBps / 100),
  slippagePct: String(st.slippageBps / 100), loopSeconds: String(st.loopSeconds), minGapMinutes: String(st.minGapSeconds / 60),
});

export function Decisions({ s, isOwner, refresh }: { s: State; isOwner: boolean; refresh: () => void }) {
  const a = s.agent;
  const st = s.strategy;
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const stats: [string, string][] = [
    ["Per trade", `$${st.tradeUsd}`],
    ["Gap needed", pct(st.edgeBps)],
    ["Checks every", `${st.loopSeconds}s`],
    ["Trade spacing", gap(st.minGapSeconds)],
    ["Gas left", `${a.operatorGasHsk.toFixed(3)} HSK`],
  ];

  const edit = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => f && { ...f, [k]: e.target.value });
  const toggle = (sym: Strategy["symbols"][number]) => setForm((f) => f && { ...f, symbols: f.symbols.includes(sym) ? f.symbols.filter((x) => x !== sym) : [...f.symbols, sym] });

  // The backend validates ranges and returns a plain error, so the form only converts units.
  async function save(f: Form) {
    setSaving({ busy: true });
    try {
      await api.strategy({
        mode: f.mode, symbols: f.symbols, tradeUsd: Number(f.tradeUsd), edgeBps: Math.round(Number(f.edgePct) * 100),
        slippageBps: Math.round(Number(f.slippagePct) * 100), loopSeconds: Number(f.loopSeconds), minGapSeconds: Math.round(Number(f.minGapMinutes) * 60),
      });
      setForm(null);
      setSaving({ busy: false });
      refresh();
    } catch (e) {
      setSaving({ busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <Panel
      flush
      title="Agent"
      right={
        <div className="flex items-center gap-2">
          <Tag tone={st.mode === "off" ? "muted" : "accent"}>{MODE[st.mode]}</Tag>
          {isOwner && !form && <Button onClick={() => setForm(toForm(st))}>Edit</Button>}
        </div>
      }
    >
      {form ? (
        <form className="border-b border-line px-4 py-3 text-sm" onSubmit={(e) => { e.preventDefault(); void save(form); }}>
          <div className="divide-y divide-line">
            <label className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-muted">Strategy</span>
              <select aria-label="Strategy" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as Form["mode"] })} className={`w-40 ${field}`}>
                {Object.entries(MODE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <fieldset className="flex items-center justify-between gap-4 py-2">
              <legend className="sr-only">Tokens the agent trades</legend>
              <span aria-hidden className="text-muted">Tokens it trades</span>
              <div className="flex gap-3">
                {ASSETS.map((x) => (
                  <label key={x} className="inline-flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" aria-label={`Trade ${x}`} checked={form.symbols.includes(x)} onChange={() => toggle(x)} className="accent-accent" />
                    {x}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Per trade" prefix="$" hint="Capped by the vault's max trade size" value={form.tradeUsd} onChange={edit("tradeUsd")} />
            <Field label="Price gap needed" suffix="%" hint="Trades only when HSKSwap is this far from the market price" value={form.edgePct} onChange={edit("edgePct")} />
            <Field label="Max slippage" suffix="%" hint="Worst fill it accepts compared with the quote" value={form.slippagePct} onChange={edit("slippagePct")} />
            <Field label="Checks every" suffix="s" value={form.loopSeconds} onChange={edit("loopSeconds")} />
            <Field label="Wait between trades" suffix="min" hint="Between the agent's own trades; 0 turns it off" value={form.minGapMinutes} onChange={edit("minGapMinutes")} />
          </div>
          {saving.error && <p className="mt-3 text-xs text-down" role="alert">{saving.error}</p>}
          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="primary" disabled={saving.busy}>{saving.busy ? "Saving…" : "Save"}</Button>
            <Button type="button" onClick={() => { setForm(null); setSaving({ busy: false }); }} disabled={saving.busy}>Cancel</Button>
          </div>
          <p className="mt-2 text-xs text-faint">These are the agent&apos;s own settings, so no signature is needed. The vault&apos;s on-chain policy still limits every trade.</p>
        </form>
      ) : (
        <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-5">
          {stats.map(([k, v]) => (
            <div key={k} className="bg-panel px-4 py-3 last:col-span-2 sm:last:col-span-1">
              <dt className={label}>{k}</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <AgentWallet s={s} isOwner={isOwner} refresh={refresh} />
      {a.simulateOnly && <p className="border-b border-line bg-warn/5 px-4 py-2.5 text-xs text-warn">Simulate-only mode: decisions are checked against the vault but never sent.</p>}
      {a.lastError && <p className="border-b border-line bg-down/5 px-4 py-2.5 font-mono text-xs text-down">Last error: {a.lastError}</p>}
      <ul className="divide-y divide-line">
        {a.decisions.map((d, i) => (
          <li key={i} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 px-4 py-3 text-sm sm:grid-cols-[3.5rem_3.5rem_minmax(0,1fr)]">
            <span className="font-medium">{d.sym}</span>
            <span><Tag tone={TONE[d.action]}>{ACTION[d.action]}</Tag></span>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <p>{d.reason}</p>
              {d.ref !== undefined && (
                <p className="mt-1 font-mono text-xs text-faint tabular-nums">
                  Market {num(d.ref, 5)} · HSKSwap buy {num(d.buy ?? 0, 5)} · sell {num(d.sell ?? 0, 5)} · Oracle {num(d.oracle ?? 0, 5)}
                </p>
              )}
            </div>
          </li>
        ))}
        {a.decisions.length === 0 && <li className="px-4 py-4 text-sm text-faint">Waiting for the first check. The agent looks at the market every {st.loopSeconds}s.</li>}
      </ul>
    </Panel>
  );
}

/** The vault's own agent wallet: its address, and for the owner, topping up or taking back its gas. */
function AgentWallet({ s, isOwner, refresh }: { s: State; isOwner: boolean; refresh: () => void }) {
  const agent = s.vault.operator as Address;
  const tx = useVaultTx(refresh);
  const [amount, setAmount] = useState("");
  const [back, setBack] = useState<{ busy: boolean; result: { ok: boolean; text: string; hash?: string } | null }>({ busy: false, result: null });
  const amountOk = /^\d*\.?\d+$/.test(amount.trim()) && Number(amount) > 0;

  async function withdraw() {
    setBack({ busy: true, result: null });
    try {
      const r = await api.withdrawAgentGas();
      setBack({ busy: false, result: { ok: true, text: `Sent ${num(Number(r.amountHsk), 4)} HSK back to your wallet`, hash: r.txHash } });
      refresh();
    } catch (e) {
      setBack({ busy: false, result: { ok: false, text: e instanceof Error ? e.message : String(e) } });
    }
  }

  return (
    <div className="border-b border-line px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-muted">Agent wallet</span>
        <a className="font-mono text-xs text-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg" href={explorerAddr(agent)} target="_blank" rel="noreferrer">
          {agent.slice(0, 6)}…{agent.slice(-4)}
        </a>
      </div>
      <p className="mt-1 text-xs text-faint">This vault&apos;s own agent. It pays for trades with this HSK and can only trade, never withdraw.</p>
      {isOwner && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input aria-label="HSK to add" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="HSK" className={`w-24 ${field}`} />
          <Button disabled={!!tx.busy || !amountOk} onClick={() => void tx.send(`Top up ${amount} HSK`, () => sendTransaction(wagmiConfig, { to: agent, value: parseEther(amount.trim()) })).then((ok) => ok && setAmount(""))}>
            {tx.busy ? "Confirm in wallet…" : "Top up gas"}
          </Button>
          <Button disabled={back.busy || s.agent.operatorGasHsk === 0} onClick={() => void withdraw()}>{back.busy ? "Sending…" : "Take gas back"}</Button>
        </div>
      )}
      <TxResult result={tx.result} />
      <TxResult result={back.result} />
    </div>
  );
}
