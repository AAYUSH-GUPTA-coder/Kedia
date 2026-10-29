"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { writeContract } from "wagmi/actions";
import { cfg, vaultAt, wagmiConfig } from "@/lib/config";
import { api, fmtError, pct, usd, type ChatTurn, type PolicyProposal, type State, type StrategyProposal, type LogEntry } from "@/lib/api";
import { proposalCalls } from "@/lib/policy";
import { useVaultTx } from "@/lib/useVaultTx";
import { Button, field, label, Panel, TxLink, TxResult } from "./ui";
import type { Address } from "viem";

type Msg = ChatTurn & { policy?: PolicyProposal; strategy?: StrategyProposal; trades?: LogEntry[] };

const MD = {
  p: (p: React.ComponentProps<"p">) => <p className="my-1.5" {...p} />,
  strong: (p: React.ComponentProps<"strong">) => <strong className="font-semibold text-fg" {...p} />,
  ul: (p: React.ComponentProps<"ul">) => <ul className="my-1.5 list-disc pl-5" {...p} />,
  ol: (p: React.ComponentProps<"ol">) => <ol className="my-1.5 list-decimal pl-5" {...p} />,
  table: (p: React.ComponentProps<"table">) => <table className="my-2 w-full text-xs" {...p} />,
  thead: (p: React.ComponentProps<"thead">) => <thead className="text-faint" {...p} />,
  th: (p: React.ComponentProps<"th">) => <th className="py-1 pr-3 text-left font-normal last:pr-0 [&:not(:first-child)]:text-right" {...p} />,
  td: (p: React.ComponentProps<"td">) => <td className="py-1 pr-3 font-mono tabular-nums last:pr-0 [&:not(:first-child)]:text-right" {...p} />,
  tr: (p: React.ComponentProps<"tr">) => <tr className="border-t border-line first:border-0" {...p} />,
};

const SUGGESTIONS = ["What are my positions and P&L?", "Halve my risk and stop trading WETH", "Buy $100 of WHSK right now", "Switch to momentum with $3 trades"];

export function Chat({ s, isOwner, needsVault, refresh }: { s: State; isOwner: boolean; needsVault: boolean; refresh: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: text.trim() }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const r = await api.chat(next.map(({ role, content }) => ({ role, content })));
      setMsgs([...next, { role: "assistant", content: r.reply, policy: r.policy, strategy: r.strategy, trades: r.trades }]);
      if (r.trades.length) refresh();
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
    }
    setBusy(false);
  }

  return (
    <Panel flush title="Talk to the agent" right={<span className="text-xs text-faint">Plain English, real trades</span>}>
      <div className="max-h-[28rem] min-h-40 space-y-4 overflow-y-auto p-4 text-sm">
        {msgs.length === 0 && (
          <div>
            <p className={label}>Try asking</p>
            <div className="mt-2 flex flex-col items-start gap-1.5">
              {SUGGESTIONS.map((q) => (
                <button key={q} type="button" disabled={!isOwner} onClick={() => send(q)} className="rounded-md border border-line px-2.5 py-1.5 text-left text-xs text-muted transition-colors enabled:hover:border-line-strong enabled:hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60">{q}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`break-words ${m.role === "user" ? "ml-8 rounded-lg bg-raised px-3 py-2" : "mr-4 leading-relaxed"}`}>
            {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : <Markdown remarkPlugins={[remarkGfm]} components={MD}>{m.content}</Markdown>}
            {m.trades?.map((t, j) => (
              <p key={j} className={`mt-1 font-mono text-xs ${t.kind === "trade" ? "text-up" : "text-down"}`}>
                {t.kind === "trade" ? `executed ${t.side} ${t.sym}` : `rejected: ${fmtError(t.error)}`} <TxLink hash={t.txHash} />
              </p>
            ))}
            {m.policy && <PolicyDiff s={s} p={m.policy} isOwner={isOwner} refresh={refresh} />}
            {m.strategy && <StrategyDiff s={s} p={m.strategy} refresh={refresh} />}
          </div>
        ))}
        {busy && <p className="animate-pulse text-faint" aria-live="polite">Thinking…</p>}
      </div>
      <div className="border-t border-line p-3">
        {isOwner ? (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <input aria-label="Message the agent" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. take less risk" className={`min-w-0 flex-1 ${field}`} />
            <Button type="submit" variant="primary" disabled={busy || !input.trim()}>Send</Button>
          </form>
        ) : <p className="px-1 py-1 text-xs text-faint">{needsVault ? "This is the demo vault. Create your vault above to talk to your own agent." : "Connect the wallet that owns this vault to talk to its agent."}</p>}
      </div>
    </Panel>
  );
}

function Row({ k, from, to }: { k: string; from: string; to: string }) {
  const changed = from !== to;
  return (
    <tr className={changed ? "text-fg" : "text-faint"}>
      <td className="py-0.5 pr-3">{k}</td>
      <td className="py-0.5 pr-3 text-right font-mono tabular-nums">{from}</td>
      <td className={`py-0.5 text-right font-mono tabular-nums ${changed ? "font-semibold text-accent" : ""}`}>{to}</td>
    </tr>
  );
}

function PolicyDiff({ s, p, isOwner, refresh }: { s: State; p: PolicyProposal; isOwner: boolean; refresh: () => void }) {
  const cur = s.vault.policy;
  const tx = useVaultTx(refresh);
  const allowedNow = s.vault.positions.filter((x) => x.allowed).map((x) => x.sym).join(", ");
  function sign() {
    const tokens = s.vault.positions.map((x) => ({ sym: x.sym, address: x.address as Address, allowed: x.allowed, feed: x.feed as Address }));
    const calls = proposalCalls(p, tokens, cfg.feeds);
    void tx.send("Apply policy", () => writeContract(wagmiConfig, { ...vaultAt(s.vault.address as Address), functionName: "multicall", args: [calls] }));
  }
  return (
    <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
      <div className="font-mono text-2xs font-medium uppercase tracking-label text-accent">Proposed on-chain policy</div>
      <table className="mt-2 w-full text-xs">
        <thead className="text-faint"><tr><th className="text-left font-normal">Limit</th><th className="text-right font-normal">Now</th><th className="text-right font-normal">Proposed</th></tr></thead>
        <tbody>
          <Row k="Max trade" from={usd(cur.maxTradeUsd)} to={usd(p.maxTradeUsd)} />
          <Row k="Daily loss cap" from={pct(cur.dailyLossCapBps)} to={pct(p.dailyLossCapBps)} />
          <Row k="Oracle band" from={pct(cur.maxOracleDeviationBps)} to={pct(p.maxOracleDeviationBps)} />
          <Row k="Cooldown" from={`${cur.cooldownSeconds}s`} to={`${p.cooldownSeconds}s`} />
          <Row k="Oracle age" from={`${cur.maxOracleAge}s`} to={`${p.maxOracleAge}s`} />
          <Row k="Tokens" from={allowedNow} to={p.allowedTokens.join(", ")} />
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">{p.rationale}</p>
      <div className="mt-2">
        {isOwner ? <Button variant="primary" disabled={!!tx.busy} onClick={sign}>{tx.busy ? "Confirm in wallet…" : "Sign & apply"}</Button> : <span className="text-xs text-faint">Connect the owner wallet to sign.</span>}
      </div>
      <TxResult result={tx.result} />
    </div>
  );
}

function StrategyDiff({ s, p, refresh }: { s: State; p: StrategyProposal; refresh: () => void }) {
  const [done, setDone] = useState<string | null>(null);
  const { rationale, ...patch } = p;
  const cur = s.strategy as Record<string, unknown>;
  return (
    <div className="mt-3 rounded-lg border border-line-strong bg-raised/50 p-3">
      <div className="font-mono text-2xs font-medium uppercase tracking-label text-muted">Proposed agent strategy</div>
      <table className="mt-2 w-full text-xs"><tbody>
        {Object.entries(patch).map(([k, v]) => <Row key={k} k={k} from={String(cur[k])} to={String(v)} />)}
      </tbody></table>
      <p className="mt-2 text-xs text-muted">{rationale}</p>
      <div className="mt-2">
        <Button variant="primary" disabled={!!done} onClick={async () => {
          try { await api.strategy(patch); setDone("Applied."); refresh(); } catch (e) { setDone(e instanceof Error ? e.message : String(e)); }
        }}>Confirm</Button>
        {done && <span className="ml-2 text-xs text-muted">{done}</span>}
      </div>
    </div>
  );
}
