import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meanReversion, momentum } from './strategy.ts';

const m = (buy: number, sell: number, ref = 1) => ({ ref, buy: { price: buy, usdtIn: 0n, assetOut: 0n }, sell: { price: sell, assetIn: 0n, usdtOut: 0n } });

test('mean reversion buys a cheap pool, sells a rich one, holds inside the edge', () => {
  assert.equal(meanReversion(m(0.99, 0.98), 60).action, 'buy');
  assert.equal(meanReversion(m(1.02, 1.01), 60).action, 'sell');
  assert.equal(meanReversion(m(1.003, 0.997), 60).action, 'hold');
});

test('momentum warms up, then follows the trend', () => {
  assert.equal(momentum([1, 2, 3], 10).action, 'hold');
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(momentum(up, 10).action, 'buy');
  assert.equal(momentum(up.toReversed(), 10).action, 'sell');
  assert.equal(momentum(Array(30).fill(100), 10).action, 'hold');
});
