import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputUnits, toRaw } from './size.ts';

test('sells sized in asset units spend exactly that amount', () => {
  assert.equal(toRaw(inputUnits('sell', { amount: 10, unit: 'asset' }, 0.08703), 18), 10n * 10n ** 18n);
  assert.equal(toRaw(inputUnits('sell', { amount: 0.002, unit: 'asset' }, 2334.41), 18), 2n * 10n ** 15n);
});

test('usd sizes convert through the oracle price; buys spend USDT', () => {
  assert.equal(inputUnits('sell', { amount: 5, unit: 'usd' }, 2.5), 2);
  assert.equal(toRaw(inputUnits('buy', { amount: 100, unit: 'usd' }, 0.08703), 6), 100_000_000n);
  assert.equal(inputUnits('buy', { amount: 100, unit: 'asset' }, 0.05), 5); // 100 WHSK worth of USDT
});
