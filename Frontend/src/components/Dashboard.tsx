"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { hashkey } from "wagmi/chains";
import { api, pct, usd, type State } from "@/lib/api";
import { DEMO_VAULT, explorerAddr } from "@/lib/config";
import { useMyVault } from "@/lib/useMyVault";
import { Chat } from "./Chat";
import { CreateVault } from "./CreateVault";
import { Decisions } from "./Decisions";
import { PolicyPanel } from "./PolicyPanel";
import { Positions } from "./Positions";
import { TradeLog } from "./TradeLog";
import { Button, Dot, label, Tag } from "./ui";

/** Shield glyph: the brand's one use of the accent outside focus rings. */
function Mark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6 shrink-0">
      <path d="M12 2.5 4 5.5v6.2c0 4.6 3.3 8.6 8 9.8 4.7-1.2 8-5.2 8-9.8V5.5l-8-3Z" fill="var(--color-accent)" fillOpacity="0.14" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
    <div className="flex items-center gap-2">
      {chainId !== hashkey.id && <Button variant="danger" onClick={() => switchChain.mutate({ chainId: hashkey.id })}>Switch to HSK Chain</Button>}
      <span className="hidden h-8 items-center gap-2 rounded-md border border-line px-2.5 text-xs text-muted sm:inline-flex">
        <Dot tone={isOwner ? "good" : "muted"} />{isOwner ? "Owner" : "Read-only"}
        <span className="font-mono text-fg">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
      </span>
      <Button onClick={() => disconnect.mutate()}>Disconnect</Button>
    </div>
  );
}

function Status({ s }: { s: State }) {
  const ago = s.agent.lastTickAt ? Math.round((Date.now() - s.agent.lastTickAt) / 1000) : null;
  const [tone, text] = s.vault.paused ? (["bad", "Paused"] as const) : s.agent.simulateOnly ? (["warn", "Simulate only"] as const) : (["good", "Agent live"] as const);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="relative inline-flex">
        {tone === "good" && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-up/60 motion-reduce:hidden" />}
        <Dot tone={tone} />
      </span>
      {text}{ago !== null && <span className="font-mono text-faint">checked {ago}s ago</span>}
    </span>
  );
}

/** How much of today's loss budget is left: a track from the floor (trading halts) to the day-start equity. */
function StopLoss({ s }: { s: State }) {
  const { dayStartEquity: start, lossFloor: floor, equity, policy } = s.vault;
  const cap = <span className="text-xs text-faint">{pct(policy.dailyLossCapBps)} daily cap</span>;
  if (!floor) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3"><span className={label}>Stop-loss</span>{cap}</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight text-muted">Not armed</div>
        <p className="mt-1 text-xs text-faint">The floor is set at the day&apos;s first trade.</p>
      </div>
    );
  }
  const left = Math.min(1, Math.max(0, (equity - floor) / (start - floor)));
  const tone = left < 0.2 ? "bg-down" : left < 0.5 ? "bg-warn" : "bg-up";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3"><span className={label}>Stop-loss headroom</span>{cap}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${equity < floor ? "text-down" : ""}`}>{usd(Math.max(0, equity - floor))}</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)} aria-label="Daily loss budget remaining">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${Math.max(2, left * 100)}%` }} />
      </div>
      <div className="mt-2 flex justify-between gap-3 font-mono text-2xs text-faint tabular-nums">
        <span>Floor {usd(floor)}</span><span>Day start {usd(start)}</span>
      </div>
    </div>
  );
}

function Summary({ s, mine }: { s: State; mine: boolean }) {
  const { pnlUsd, netDepositsUsd, dayChangePct } = s.pnl;
  const sign = (x: number) => (x >= 0 ? "+" : "−");
  return (
    <section className="rounded-xl border border-line bg-panel" aria-label="Vault summary">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{mine ? "Your vault" : "Demo vault"}</span>
          <a className="font-mono text-xs text-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-fg" href={explorerAddr(s.vault.address)} target="_blank" rel="noreferrer">
            {s.vault.address.slice(0, 8)}…{s.vault.address.slice(-4)}
          </a>
          {!mine && <Tag>Read-only</Tag>}
        </div>
        <Status s={s} />
      </header>
      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-12 lg:gap-0">
        <div className="lg:col-span-4 lg:pr-6">
          <span className={label}>Equity</span>
          <div className="mt-2 text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">{usd(s.vault.equity)}</div>
          <p className="mt-2 text-xs text-faint">Net deposits <span className="font-mono text-muted">{usd(netDepositsUsd)}</span> · marked at oracle prices</p>
        </div>
        <div className="border-t border-line pt-6 lg:col-span-3 lg:border-t-0 lg:border-l lg:px-6 lg:pt-0">
          <span className={label}>P&amp;L</span>
          <div className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${pnlUsd >= 0 ? "text-up" : "text-down"}`}>{sign(pnlUsd)}{usd(Math.abs(pnlUsd))}</div>
          <p className="mt-2 text-xs text-faint">
            {s.vault.dayStartEquity ? <>Today <span className={`font-mono ${dayChangePct >= 0 ? "text-up" : "text-down"}`}>{sign(dayChangePct)}{Math.abs(dayChangePct).toFixed(2)}%</span></> : "No trades today"}
          </p>
        </div>
        <div className="border-t border-line pt-6 lg:col-span-5 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
          <StopLoss s={s} />
        </div>
      </div>
    </section>
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
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Mark />
            <h1 className="font-semibold tracking-tight">Kedia</h1>
            <p className="hidden truncate text-sm text-faint md:block">An AI agent trading on HSKSwap inside limits the vault enforces on-chain.</p>
          </div>
          <Wallet owner={s?.vault.owner} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        {!address && (
          <p className="flex items-center gap-2.5 rounded-lg border border-line bg-panel px-4 py-3 text-sm text-muted">
            <Dot tone="muted" />You are looking at the demo vault. Connect a wallet to create your own vault and let the agent trade it within your rules.
          </p>
        )}
        {mine.checked && !mine.vault && <CreateVault onCreated={() => void mine.refetch()} />}

        {state.error && <p className="rounded-lg border border-down/30 bg-down/10 px-4 py-3 text-sm text-down">Backend unreachable: {state.error.message}. Start it with <code className="font-mono">pnpm backend</code>.</p>}
        {!s && !state.error && (
          <div className="grid gap-4 lg:grid-cols-12" aria-busy aria-label="Loading vault">
            <div className="h-40 animate-pulse rounded-xl border border-line bg-panel lg:col-span-12" />
            <div className="h-72 animate-pulse rounded-xl border border-line bg-panel lg:col-span-8" />
            <div className="h-72 animate-pulse rounded-xl border border-line bg-panel lg:col-span-4" />
          </div>
        )}

        {s && (
          <>
            <Summary s={s} mine={!!mine.vault} />
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="min-w-0 space-y-4 lg:col-span-8">
                <Positions s={s} />
                <Decisions s={s} />
                <TradeLog log={log.data ?? []} />
              </div>
              <aside className="min-w-0 space-y-4 lg:col-span-4">
                <Chat s={s} isOwner={isOwner} refresh={refresh} />
                <PolicyPanel s={s} isOwner={isOwner} refresh={refresh} />
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
