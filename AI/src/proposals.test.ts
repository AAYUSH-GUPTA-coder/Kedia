import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePolicy, type PolicyProposal } from './proposals.ts';

const ok: PolicyProposal = { maxTradeUsd: 5, dailyLossCapBps: 250, maxOracleDeviationBps: 500, cooldownSeconds: 300, maxOracleAge: 93600, allowedTokens: ['USDT', 'WHSK'], rationale: 'x' };

test('accepts a sane policy and rejects out-of-range model output', () => {
  assert.equal(validatePolicy(ok), null);
  assert.match(validatePolicy({ ...ok, maxTradeUsd: -1 })!, /maxTradeUsd/);
  assert.match(validatePolicy({ ...ok, dailyLossCapBps: 10_001 })!, /dailyLossCapBps/);
  assert.match(validatePolicy({ ...ok, cooldownSeconds: 1.5 })!, /cooldownSeconds/);
  assert.match(validatePolicy({ ...ok, allowedTokens: ['USDT', 'DOGE' as 'USDT'] })!, /allowedTokens/);
  assert.match(validatePolicy({ ...ok, allowedTokens: ['USDT', 'USDT'] })!, /duplicates/);
});
