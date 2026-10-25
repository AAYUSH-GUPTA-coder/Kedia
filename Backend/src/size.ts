import { parseUnits } from 'viem';

/** A user-requested trade size: dollars, or units of the asset being bought or sold. */
export type TradeSize = { amount: number; unit: 'usd' | 'asset' };

/**
 * How much of the input token a manual trade spends, in whole tokens.
 * Sells spend the asset; buys spend USDT, counted 1:1 with USD.
 * A buy sized in asset units spends that many units' worth at the oracle price.
 */
export function inputUnits(side: 'buy' | 'sell', size: TradeSize, price: number): number {
  if (side === 'sell') return size.unit === 'asset' ? size.amount : size.amount / price;
  return size.unit === 'usd' ? size.amount : size.amount * price;
}

/** Whole-token amount to raw integer units. toFixed keeps typed amounts like 10 or 0.002 exact. */
export const toRaw = (x: number, decimals: number): bigint => parseUnits(x.toFixed(decimals), decimals);
