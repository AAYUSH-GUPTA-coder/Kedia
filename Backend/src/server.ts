import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { formatEther, getAddress, isAddress, isAddressEqual, zeroAddress, type Address } from 'viem';
import { chat, type ChatTurn, type StrategyProposal } from '@kedia/ai';
import { ASSETS, cfg, DEMO_VAULT, FRONTEND_ORIGIN, type Asset } from './config.ts';
import { factory, listVaults, publicClient, vaultAt } from './chain.ts';
import { readVault } from './market.ts';
import { netDepositsUsd } from './pnl.ts';
import { agentStatus, manualTrade } from './agent.ts';
import { HttpError, login, newNonce, ownerOf } from './auth.ts';
import { loadStrategy, readLog, saveStrategy, validateStrategy } from './store.ts';

export async function getState(vault: Address) {
  const [v, net] = await Promise.all([readVault(vault), netDepositsUsd(vault)]);
  const gas = await publicClient.getBalance({ address: v.operator });
  return {
    vault: v,
    pnl: { netDepositsUsd: net, pnlUsd: v.equity - net, dayChangePct: v.dayStartEquity ? (v.equity / v.dayStartEquity - 1) * 100 : 0 },
    strategy: loadStrategy(vault),
    agent: { ...agentStatus(vault), operatorGasHsk: Number(formatEther(gas)) },
    explorer: cfg.explorer,
  };
}

/** Public reads: `?vault=` must be a factory vault; without it, the demo vault. */
async function readTarget(url: URL): Promise<Address> {
  const q = url.searchParams.get('vault');
  if (!q) return DEMO_VAULT;
  if (!isAddress(q)) throw new HttpError(400, 'vault must be an address');
  const v = getAddress(q);
  if (!(await listVaults()).some((x) => isAddressEqual(x, v))) throw new HttpError(404, 'not a Guarded Trader vault');
  return v;
}

/** Writes act only on the signed-in wallet's own vault, looked up on-chain, never on an address the client sends. */
async function myVault(req: IncomingMessage): Promise<Address> {
  const owner = ownerOf(req);
  const vault = await publicClient.readContract({ ...factory, functionName: 'vaultOf', args: [owner] });
  if (vault === zeroAddress) throw new HttpError(404, 'This wallet has no vault yet. Create one first.');
  // The owner may have handed the vault to another wallet since creating it.
  const current = await publicClient.readContract({ ...vaultAt(vault), functionName: 'owner' });
  if (!isAddressEqual(current, owner)) throw new HttpError(403, 'This wallet no longer owns its vault.');
  return vault;
}

async function trade(vault: Address, body: { symbol: Asset; side: 'buy' | 'sell'; amount: number; unit: 'usd' | 'asset' }, source: 'chat' | 'demo') {
  const ok = ASSETS.includes(body.symbol) && ['buy', 'sell'].includes(body.side) && ['usd', 'asset'].includes(body.unit) && body.amount > 0 && body.amount < 1e12;
  if (!ok) throw new HttpError(400, 'invalid trade request: need symbol WHSK|WETH, side buy|sell, unit usd|asset, amount > 0');
  return manualTrade(vault, body.symbol, body.side, { amount: body.amount, unit: body.unit }, source);
}

type Ctx = { req: IncomingMessage; url: URL; body: any };
const routes: Record<string, (c: Ctx) => Promise<unknown>> = {
  'GET /state': async ({ url }) => getState(await readTarget(url)),
  'GET /log': async ({ url }) => readLog(await readTarget(url)),
  'GET /nonce': async () => newNonce(),
  'POST /login': async ({ body }) => login(body),
  'POST /strategy': async ({ req, body }) => {
    const vault = await myVault(req);
    const { rationale: _, ...rest } = body as Partial<StrategyProposal>;
    return saveStrategy(vault, rest);
  },
  'POST /trade': async ({ req, body }) => trade(await myVault(req), body, 'demo'),
  'POST /chat': async ({ req, body }) => {
    const vault = await myVault(req);
    const { messages } = body as { messages: ChatTurn[] };
    if (!Array.isArray(messages) || messages.length === 0) throw new HttpError(400, 'messages required');
    return chat(messages, {
      getState: async () => {
        const s = await getState(vault);
        // Positions without raw bigints, plus the latest log lines, keep the model's context small.
        return { ...s, vault: { ...s.vault, positions: s.vault.positions.map(({ raw: _, ...p }) => p) }, recentLog: readLog(vault).slice(0, 8) };
      },
      checkStrategy: (p) => {
        const { rationale: _, ...rest } = p;
        return validateStrategy({ ...loadStrategy(vault), ...rest });
      },
      attemptTrade: (a) => trade(vault, a, 'chat'),
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
    if (raw.length > 200_000) throw new HttpError(413, 'body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

export function startServer(host: string, port: number) {
  createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', FRONTEND_ORIGIN);
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const url = new URL(req.url ?? '/', 'http://x');
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return json(res, 404, { error: 'not found' });
    try {
      json(res, 200, await handler({ req, url, body: await readBody(req) }));
    } catch (e) {
      json(res, e instanceof HttpError ? e.status : 400, { error: e instanceof Error ? e.message : String(e) });
    }
  }).listen(port, host, () => console.log(`API on http://${host}:${port}`));
}
