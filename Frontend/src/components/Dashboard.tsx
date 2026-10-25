"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { hashkey } from "wagmi/chains";
import { api, usd } from "@/lib/api";
import { explorerAddr } from "@/lib/config";
import { Chat } from "./Chat";
import { Decisions } from "./Decisions";
import { PolicyPanel } from "./PolicyPanel";
import { Positions } from "./Positions";
import { TradeLog } from "./TradeLog";
import { Button, Stat } from "./ui";

function Wallet({ owner }: { owner?: string }) {
  const { address, isConnected } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const chainId = useChainId();
  const switchChain = useSwitchChain();
  if (!isConnected) return <Button variant="primary" onClick={() => connectors[0] && connect.mutate({ connector: connectors[0] })}>Connect owner wallet</Button>;
  const isOwner = owner && address?.toLowerCase() === owner.toLowerCase();
  return (
    <div className="flex items-center gap-2 text-xs">
      {chainId !== hashkey.id && <Button variant="danger" onClick={() => switchChain.mutate({ chainId: hashkey.id })}>Switch to HSK Chain</Button>}
      <span className={`rounded px-2 py-1 ${isOwner ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/60"}`}>{isOwner ? "owner" : "not owner"} · {address?.slice(0, 6)}…{address?.slice(-4)}</span>
      <Button onClick={() => disconnect.mutate()}>Disconnect</Button>
    </div>
  );
}

export function Dashboard() {
  const state = useQuery({ queryKey: ["state"], queryFn: api.state, refetchInterval: 5000 });
  const log = useQuery({ queryKey: ["log"], queryFn: api.log, refetchInterval: 5000 });
  const { address } = useConnection();
  const s = state.data;
  const refresh = () => { void state.refetch(); void log.refetch(); };
  const isOwner = !!s && !!address && address.toLowerCase() === s.vault.owner.toLowerCase();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Guarded Trader</h1>
          <p className="text-xs text-white/50">
            AI agent trading on HSKSwap inside limits the vault enforces on-chain.
            {s && <> Vault <a className="font-mono text-sky-400 hover:underline" href={explorerAddr(s.vault.address)} target="_blank" rel="noreferrer">{s.vault.address.slice(0, 10)}…</a></>}
          </p>
        </div>
        <Wallet owner={s?.vault.owner} />
      </header>

      {state.error && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">Backend unreachable: {state.error.message}. Start it with <code>pnpm backend</code>.</p>}
      {!s && !state.error && <p className="text-white/50">Loading vault…</p>}

      {s && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Equity (oracle-marked)" value={usd(s.vault.equity)} sub={`Net deposits ${usd(s.pnl.netDepositsUsd)}`} />
            <Stat label="P&L" value={`${s.pnl.pnlUsd >= 0 ? "+" : ""}${usd(s.pnl.pnlUsd)}`} tone={s.pnl.pnlUsd >= 0 ? "good" : "bad"} sub={s.vault.dayStartEquity ? `Today ${s.pnl.dayChangePct.toFixed(2)}%` : "No trades today"} />
            <Stat label="Stop-loss floor today" value={s.vault.lossFloor ? usd(s.vault.lossFloor) : "–"} sub={s.vault.lossFloor ? `Headroom ${usd(s.vault.equity - s.vault.lossFloor)}` : "Set at the day's first trade"} tone={s.vault.lossFloor && s.vault.equity < s.vault.lossFloor ? "bad" : undefined} />
            <Stat label="Agent gas balance" value={`${s.agent.operatorGasHsk.toFixed(3)} HSK`} sub="Operator key holds gas only" tone={s.agent.operatorGasHsk < 0.5 ? "bad" : undefined} />
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_26rem]">
            <div className="space-y-6">
              <Positions s={s} />
              <Decisions s={s} />
              <TradeLog log={log.data ?? []} />
            </div>
            <div className="space-y-6">
              <Chat s={s} isOwner={isOwner} refresh={refresh} />
              <PolicyPanel s={s} isOwner={isOwner} refresh={refresh} />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
