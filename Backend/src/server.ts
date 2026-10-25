import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { formatEther } from 'viem';
import { chat, type ChatTurn, type StrategyProposal } from '@kedia/ai';
import { ASSETS, cfg, type Asset } from './config.ts';
import { publicClient } from './chain.ts';
import { readVault } from './market.ts';
import { netDepositsUsd } from './pnl.ts';
import { manualTrade, status } from './agent.ts';
import { loadStrategy, readLog, saveStrategy, validateStrategy } from './store.ts';

export async function getState() {
  const [v, net] = await Promise.all([readVault(), netDepositsUsd()]);
  const gas = await publicClient.getBalance({ address: v.operator });
  return {
    vault: v,
    pnl: { netDepositsUsd: net, pnlUsd: v.equity - net, dayChangePct: v.dayStartEquity ? (v.equity / v.dayStartEquity - 1) * 100 : 0 },
    strategy: loadStrategy(),
    agent: { ...status, operatorGasHsk: Number(formatEther(gas)) },
    explorer: cfg.explorer,
  };
}

async function trade(body: { symbol: Asset; side: 'buy' | 'sell'; amount: number; unit: 'usd' | 'asset' }, source: 'chat' | 'demo') {
  const ok = ASSETS.includes(body.symbol) && ['buy', 'sell'].includes(body.side) && ['usd', 'asset'].includes(body.unit) && body.amount > 0 && body.amount < 1e12;
  if (!ok) throw new Error('invalid trade request: need symbol WHSK|WETH, side buy|sell, unit usd|asset, amount > 0');
  return manualTrade(body.symbol, body.side, { amount: body.amount, unit: body.unit }, source);
}

const routes: Record<string, (body: any) => Promise<unknown>> = {
  'GET /state': getState,
  'GET /log': async () => readLog(),
  'POST /strategy': async (patch: Partial<StrategyProposal>) => {
    const { rationale: _, ...rest } = patch;
    return saveStrategy(rest);
  },
  'POST /trade': (b) => trade(b, 'demo'),
  'POST /chat': async ({ messages }: { messages: ChatTurn[] }) => {
    if (!Array.isArray(messages) || messages.length === 0) throw new Error('messages required');
    return chat(messages, {
      getState: async () => {
        const s = await getState();
        // Positions without raw bigints, plus the latest log lines, keep the model's context small.
        return { ...s, vault: { ...s.vault, positions: s.vault.positions.map(({ raw: _, ...p }) => p) }, recentLog: readLog().slice(0, 8) };
      },
      checkStrategy: (p) => {
        const { rationale: _, ...rest } = p;
        return validateStrategy({ ...loadStrategy(), ...rest });
      },
      attemptTrade: (a) => trade(a, 'chat'),
    });
  },
};

const json = (res: ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
};

async function readBody(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 200_000) throw new Error('body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

export function startServer(port: number) {
  const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
  createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const handler = routes[`${req.method} ${new URL(req.url ?? '/', 'http://x').pathname}`];
    if (!handler) return json(res, 404, { error: 'not found' });
    try {
      json(res, 200, await handler(await readBody(req)));
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
  }).listen(port, '127.0.0.1', () => console.log(`API on http://127.0.0.1:${port}`));
}
