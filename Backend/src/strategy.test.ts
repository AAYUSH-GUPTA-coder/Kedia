import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentCooldownLeft, meanReversion, momentum } from './strategy.ts';

const m = (buy: number, sell: number, ref = 1) => ({ ref, buy: { price: buy, usdtIn: 0n, assetOut: 0n }, sell: { price: sell, assetIn: 0n, usdtOut: 0n } });

test('mean reversion buys a cheap pool, sells a rich one, holds inside the edge', () => {
  assert.equal(meanReversion(m(0.99, 0.98), 60).action, 'buy');
  assert.equal(meanReversion(m(1.02, 1.01), 60).action, 'sell');
  assert.equal(meanReversion(m(1.003, 0.997), 60).action, 'hold');
  assert.equal(meanReversion(m(1.003, 0.997), 60).reason, "Waiting: HSKSwap isn't 0.60% cheaper or pricier than the market yet");
});

test('momentum warms up, then follows the trend', () => {
  assert.equal(momentum([1, 2, 3], 10).action, 'hold');
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(momentum(up, 10).action, 'buy');
  assert.equal(momentum(up.toReversed(), 10).action, 'sell');
  assert.equal(momentum(Array(30).fill(100), 10).action, 'hold');
  assert.match(momentum([100], 10).reason, /^Collecting prices/);
});

test('agent cooldown counts only the agent\'s own trades', () => {
  const t = 1_000_000;
  const chat = { ts: t, kind: 'trade' as const, source: 'chat' as const };
  const agent = { ts: t - 100_000, kind: 'trade' as const, source: 'agent' as const };
  const rejected = { ts: t, kind: 'rejected' as const, source: 'agent' as const };
  assert.equal(agentCooldownLeft([], t, 300), 0);
  assert.equal(agentCooldownLeft([chat, rejected], t, 300), 0); // chat trades and rejections never start it
  assert.equal(agentCooldownLeft([chat, rejected, agent], t, 300), 200); // 300s since the agent's trade 100s ago
  assert.equal(agentCooldownLeft([agent], t + 400_000, 300), 0);
  assert.equal(agentCooldownLeft([agent], t, 0), 0); // 0 turns the gap off
});
