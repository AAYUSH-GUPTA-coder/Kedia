"use client";

import { useEffect, useRef, useState } from "react";
import type { EquityPoint, LogEntry } from "@/lib/api";
import { usd } from "@/lib/api";

const H = 150;
const PAD = { top: 12, right: 12, bottom: 22, left: 56 };
const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Vault value over time with today's stop-loss floor, and a mark for every trade (dot) and blocked trade (cross). */
export function EquityChart({ points, log }: { points: EquityPoint[]; log: LogEntry[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [points.length >= 2]); // the measured box only exists once there is a line to draw

  if (points.length < 2) {
    return <p className="text-sm text-faint">The chart fills in as the agent checks the vault, one point a minute.</p>;
  }

  const t0 = points[0].ts, t1 = points[points.length - 1].ts;
  const floors = points.filter((p) => p.floorUsd > 0).map((p) => p.floorUsd);
  const ys = [...points.map((p) => p.equityUsd), ...floors];
  const span = Math.max(Math.max(...ys) - Math.min(...ys), Math.max(...ys) * 0.002); // a flat line still gets some height
  const [lo, hi] = [Math.min(...ys) - span * 0.15, Math.max(...ys) + span * 0.15];
  const x = (ts: number) => PAD.left + ((ts - t0) / (t1 - t0 || 1)) * Math.max(w - PAD.left - PAD.right, 1);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const nearest = (ts: number) => points.reduce((b, p, i) => (Math.abs(p.ts - ts) < Math.abs(points[b].ts - ts) ? i : b), 0);

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.ts).toFixed(1)},${y(p.equityUsd).toFixed(1)}`).join("");
  const floorLine = points.map((p) => (p.floorUsd > 0 ? `${x(p.ts).toFixed(1)},${y(p.floorUsd).toFixed(1)}` : null));
  const floorPath = floorLine.map((pt, i) => (pt ? `${i && floorLine[i - 1] ? "L" : "M"}${pt}` : "")).join("");
  const events = log.filter((e) => e.ts >= t0 && e.ts <= t1 && e.kind !== "simulated");
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  const h = hover === null ? null : points[hover];
  const values = points.map((p) => p.equityUsd);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded bg-fg/80" />Vault value</span>
        {floors.length > 0 && <span className="inline-flex items-center gap-1.5"><span aria-hidden className="w-4 border-t-2 border-dashed border-down/70" />Stop-loss floor</span>}
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-up" />Trade</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="font-mono text-down">✕</span>Blocked by the vault</span>
      </div>
      <div ref={box} className="relative">
        {w > 0 && (
          <svg width={w} height={H} role="img" aria-label={`Vault value from ${usd(values[0])} at ${time(t0)} to ${usd(values[values.length - 1])} at ${time(t1)}`}
            onPointerMove={(e) => setHover(nearest(t0 + ((e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.left) / Math.max(w - PAD.left - PAD.right, 1)) * (t1 - t0)))}
            onPointerLeave={() => setHover(null)} className="touch-none select-none">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={w - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" />
                <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-faint font-mono text-[10px]">{usd(v)}</text>
              </g>
            ))}
            <text x={PAD.left} y={H - 6} className="fill-faint font-mono text-[10px]">{time(t0)}</text>
            <text x={w - PAD.right} y={H - 6} textAnchor="end" className="fill-faint font-mono text-[10px]">{time(t1)}</text>
            {floorPath && <path d={floorPath} fill="none" strokeWidth={1.5} strokeDasharray="4 4" className="stroke-down/70" />}
            <path d={line} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-fg/80" />
            {events.map((e, i) => {
              const p = points[nearest(e.ts)];
              const [cx, cy] = [x(e.ts), y(p.equityUsd)];
              return e.kind === "trade"
                ? <circle key={i} cx={cx} cy={cy} r={4} strokeWidth={2} className="fill-up stroke-panel" />
                : <path key={i} d={`M${cx - 4},${cy - 4}L${cx + 4},${cy + 4}M${cx + 4},${cy - 4}L${cx - 4},${cy + 4}`} strokeWidth={2.5} strokeLinecap="round" className="stroke-down" />;
            })}
            {h && (
              <g>
                <line x1={x(h.ts)} x2={x(h.ts)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-line-strong" />
                <circle cx={x(h.ts)} cy={y(h.equityUsd)} r={4} strokeWidth={2} className="fill-fg stroke-panel" />
              </g>
            )}
          </svg>
        )}
        {h && (
          <div className="pointer-events-none absolute top-0 rounded-md border border-line-strong bg-raised px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(x(h.ts) + 10, 0), Math.max(w - 170, 0)) }}>
            <div className="font-mono font-semibold tabular-nums text-fg">{usd(h.equityUsd)}</div>
            {h.floorUsd > 0 && <div className="font-mono tabular-nums text-muted">floor {usd(h.floorUsd)}</div>}
            <div className="text-faint">{time(h.ts)}</div>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Vault value over time</caption>
        <tbody>
          <tr><th scope="row">First, {time(t0)}</th><td>{usd(values[0])}</td></tr>
          <tr><th scope="row">Lowest</th><td>{usd(Math.min(...values))}</td></tr>
          <tr><th scope="row">Highest</th><td>{usd(Math.max(...values))}</td></tr>
          <tr><th scope="row">Latest, {time(t1)}</th><td>{usd(values[values.length - 1])}</td></tr>
          <tr><th scope="row">Trades / blocked in this period</th><td>{events.filter((e) => e.kind === "trade").length} / {events.filter((e) => e.kind === "rejected").length}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
