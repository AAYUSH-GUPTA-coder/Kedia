"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { hashkey } from "wagmi/chains";
import { api, usd, type State } from "@/lib/api";
import { DEMO_VAULT, explorerAddr } from "@/lib/config";
import { useMyVault } from "@/lib/useMyVault";
import { Chat } from "./Chat";
import { CreateVault } from "./CreateVault";
import { Decisions } from "./Decisions";
import { PolicyPanel } from "./PolicyPanel";
import { Positions } from "./Positions";
import { TradeLog } from "./TradeLog";
import { Button, Dot, Metric } from "./ui";

function Wallet({ owner }: { owner?: string }) {
  const { address, isConnected } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const chainId = useChainId();
  const switchChain = useSwitchChain();
  if (!isConnected) return <Button variant="primary" onClick={() => connectors[0] && connect.mutate({ connector: connectors[0] })}>Connect wallet</Button>;
  const isOwner = owner && address?.toLowerCase() === owner.toLowerCase();
  return (
    <div className="flex items-center gap-2 text-xs">
      {chainId !== hashkey.id && <Button variant="danger" onClick={() => switchChain.mutate({ chainId: hashkey.id })}>Switch to HSK Chain</Button>}
      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 ${isOwner ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/60"}`}>
        <Dot tone={isOwner ? "good" : "muted"} />{isOwner ? "Your vault" : "Read-only"} · <span className="font-mono">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
      </span>
      <Button onClick={() => disconnect.mutate()}>Disconnect</Button>
    </div>
  );
}

function Status({ s }: { s: State }) {
  const ago = s.agent.lastTickAt ? Math.round((Date.now() - s.agent.lastTickAt) / 1000) : null;
  const [tone, text] = s.vault.paused ? (["bad", "Paused"] as const) : s.agent.simulateOnly ? (["warn", "Simulate only"] as const) : (["good", "Live"] as const);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/60">
      <Dot tone={tone} />{text}{ago !== null && <span className="text-white/40"> · checked {ago}s ago</span>}
    </span>
  );
}

function LossBudget({ s }: { s: State }) {
  const { dayStartEquity: start, lossFloor: floor, equity } = s.vault;
  if (!floor) return null;
  const used = Math.min(1, Math.max(0, (start - equity) / (start - floor)));
  return (
    <div className="mt-2 h-1 w-full max-w-[14rem] overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)} aria-label="Daily loss budget used">
      <div className={`h-full rounded-full ${used > 0.7 ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${Math.max(2, used * 100)}%` }} />
    </div>
  );
}

export function Dashboard() {
  const { address } = useConnection();
  const mine = useMyVault();
  // A wallet with a vault sees its own; everyone else sees the demo vault read-only.
  const target = mine.vault ?? DEMO_VAULT;
  const state = useQuery({ queryKey: ["state", target], queryFn: () => api.state(target), refetchInterval: 5000 });
  const log = useQuery({ queryKey: ["log", target], queryFn: () => api.log(target), refetchInterval: 5000 });
  const s = state.data;
  const refresh = () => { void state.refetch(); void log.refetch(); };
  const isOwner = !!s && !!address && address.toLowerCase() === s.vault.owner.toLowerCase();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Guarded Trader</h1>
            {s && <Status s={s} />}
          </div>
          <p className="mt-1 text-sm text-white/55">
            An AI agent trading on HSKSwap inside limits the vault enforces on-chain.
            {s && <> {mine.vault ? "Your vault" : "Demo vault"} <a className="font-mono text-xs text-sky-400 hover:underline" href={explorerAddr(s.vault.address)} target="_blank" rel="noreferrer">{s.vault.address.slice(0, 10)}…</a></>}
          </p>
        </div>
        <Wallet owner={s?.vault.owner} />
      </header>

      {!address && <p className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/65">You are looking at the demo vault. Connect a wallet to create your own vault and let the agent trade it within your rules.</p>}
      {mine.checked && !mine.vault && (
        <>
          <CreateVault onCreated={() => void mine.refetch()} />
          <p className="mt-6 text-xs uppercase tracking-wide text-white/40">Demo vault, read-only</p>
        </>
      )}

      {state.error && <p className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">Backend unreachable: {state.error.message}. Start it with <code className="font-mono">pnpm backend</code>.</p>}
      {!s && !state.error && (
        <div className="mt-8 grid grid-cols-2 gap-6 border-y border-white/10 py-5 sm:grid-cols-3" aria-busy aria-label="Loading vault">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-md bg-white/5" />)}
        </div>
      )}

      {s && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 border-y border-white/10 py-5 sm:grid-cols-3">
            <Metric lead label="Equity" value={usd(s.vault.equity)} sub={`Net deposits ${usd(s.pnl.netDepositsUsd)} · marked at oracle prices`} />
            <Metric label="P&L" value={`${s.pnl.pnlUsd >= 0 ? "+" : ""}${usd(s.pnl.pnlUsd)}`} tone={s.pnl.pnlUsd >= 0 ? "good" : "bad"} sub={s.vault.dayStartEquity ? `Today ${s.pnl.dayChangePct >= 0 ? "+" : ""}${s.pnl.dayChangePct.toFixed(2)}%` : "No trades today"} />
            <Metric
              label="Stop-loss floor"
              value={s.vault.lossFloor ? usd(s.vault.lossFloor) : "Not set"}
              tone={s.vault.lossFloor && s.vault.equity < s.vault.lossFloor ? "bad" : undefined}
              sub={s.vault.lossFloor ? `${usd(s.vault.equity - s.vault.lossFloor)} headroom before trading stops` : "Set at the day's first trade"}
            >
              <LossBudget s={s} />
            </Metric>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10">
            <div className="min-w-0 space-y-10">
              <Positions s={s} />
              <Decisions s={s} />
              <TradeLog log={log.data ?? []} />
            </div>
            <aside className="divide-y divide-white/10 self-start rounded-xl border border-white/10 bg-white/[0.025] [&>*]:p-5">
              <Chat s={s} isOwner={isOwner} refresh={refresh} />
              <PolicyPanel s={s} isOwner={isOwner} refresh={refresh} />
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
