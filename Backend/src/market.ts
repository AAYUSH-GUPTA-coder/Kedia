import { erc20Abi, formatUnits, type Address } from 'viem';
import { cfg, QUOTER, token, type Asset, type Sym } from './config.ts';
import { toRaw } from './size.ts';
import { feedAbi, publicClient, quoterAbi, vaultAt } from './chain.ts';

const SYMS = Object.keys(cfg.tokens) as Sym[];
const usd8 = (x: bigint) => Number(x) / 1e8;

export type Policy = { maxTradeUsd: number; dailyLossCapBps: number; maxOracleDeviationBps: number; cooldownSeconds: number; maxOracleAge: number };
export type Position = { sym: Sym; address: Address; allowed: boolean; feed: Address; balance: number; raw: bigint; price: number | null; usd: number };
export type VaultState = {
  address: Address; owner: Address; operator: Address; paused: boolean; policy: Policy;
  lastTradeAt: number; dayStartEquity: number; lossFloor: number; equity: number; positions: Position[];
};

/** One round trip (Multicall3) for everything the agent and dashboard need from the vault. */
export async function readVault(addr: Address): Promise<VaultState> {
  const vault = vaultAt(addr);
  const [owner, operator, paused, policy, lastTradeAt, dayStartEquity, lossFloor, list] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { ...vault, functionName: 'owner' }, { ...vault, functionName: 'operator' }, { ...vault, functionName: 'paused' },
      { ...vault, functionName: 'policy' }, { ...vault, functionName: 'lastTradeAt' }, { ...vault, functionName: 'dayStartEquity' },
      { ...vault, functionName: 'lossFloor' }, { ...vault, functionName: 'allowedTokenList' },
    ],
  });
  const [tokens, feeds] = list;
  const feedOf = new Map(tokens.map((t, i) => [t.toLowerCase(), feeds[i]]));
  const zero = '0x0000000000000000000000000000000000000000';

  const reads = await publicClient.multicall({
    contracts: SYMS.flatMap((s) => {
      const feed = (feedOf.get(token(s).address.toLowerCase()) ?? zero) as Address;
      return [
        { address: token(s).address, abi: erc20Abi, functionName: 'balanceOf', args: [addr] } as const,
        // Unlisted tokens have no vault feed; read a known feed only for display.
        { address: (feed === zero ? cfg.feeds[s] : feed) as Address, abi: feedAbi, functionName: 'latestRoundData' } as const,
      ];
    }),
  });

  const positions: Position[] = SYMS.map((s, i) => {
    const raw = (reads[2 * i].result as bigint | undefined) ?? 0n;
    const round = reads[2 * i + 1].result as readonly [bigint, bigint, bigint, bigint, bigint] | undefined;
    const price = round && round[1] > 0n ? usd8(round[1]) : null;
    const feed = (feedOf.get(token(s).address.toLowerCase()) ?? zero) as Address;
    const balance = Number(formatUnits(raw, token(s).decimals));
    return { sym: s, address: token(s).address, allowed: feed !== zero, feed, balance, raw, price, usd: price ? balance * price : 0 };
  });

  return {
    address: addr, owner, operator, paused,
    policy: {
      maxTradeUsd: usd8(policy.maxTradeUsd), dailyLossCapBps: policy.dailyLossCapBps,
      maxOracleDeviationBps: policy.maxOracleDeviationBps, cooldownSeconds: policy.cooldownSeconds, maxOracleAge: policy.maxOracleAge,
    },
    lastTradeAt: Number(lastTradeAt), dayStartEquity: usd8(dayStartEquity), lossFloor: usd8(lossFloor),
    // Same basket as the contract's equity(): allowed tokens only.
    equity: positions.filter((p) => p.allowed).reduce((a, p) => a + p.usd, 0),
    positions,
  };
}

/** HashKey Exchange best bid/ask mid. Null when the API is unreachable, so callers fall back to the oracle. */
export async function exchangeMid(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(`${cfg.exchangeApi}/quote/v1/ticker/bookTicker?symbol=${symbol}`, { signal: AbortSignal.timeout(5000) });
    const [t] = (await r.json()) as { b: string; a: string }[];
    const mid = (Number(t.b) + Number(t.a)) / 2;
    return mid > 0 ? mid : null;
  } catch {
    return null;
  }
}

async function quote(tokenIn: Sym, tokenOut: Sym, amountIn: bigint, fee: number): Promise<bigint> {
  const { result } = await publicClient.simulateContract({
    address: QUOTER, abi: quoterAbi, functionName: 'quoteExactInputSingle',
    args: [{ tokenIn: token(tokenIn).address, tokenOut: token(tokenOut).address, amountIn, fee, sqrtPriceLimitX96: 0n }],
  });
  return result[0];
}

export type Market = {
  sym: Asset; fee: number; oracle: number; exchange: number | null; ref: number;
  buy: { usdtIn: bigint; assetOut: bigint; price: number };
  sell: { assetIn: bigint; usdtOut: bigint; price: number };
};

/** Executable HSKSwap prices (after fee and impact) for a trade of `usd` each way, plus reference prices. */
export async function readMarket(sym: Asset, usd: number, oracle: number): Promise<Market> {
  const t = cfg.tokens[sym];
  const dec = t.decimals;
  const usdtIn = toRaw(usd, 6);
  const assetIn = toRaw(usd / oracle, dec);
  const [assetOut, usdtOut, exchange] = await Promise.all([
    quote('USDT', sym, usdtIn, t.fee), quote(sym, 'USDT', assetIn, t.fee), exchangeMid(t.exchangeSymbol),
  ]);
  const amt = (x: bigint, d: number) => Number(formatUnits(x, d));
  return {
    sym, fee: t.fee, oracle, exchange, ref: exchange ?? oracle,
    buy: { usdtIn, assetOut, price: amt(usdtIn, 6) / amt(assetOut, dec) },
    sell: { assetIn, usdtOut, price: amt(usdtOut, 6) / amt(assetIn, dec) },
  };
}
