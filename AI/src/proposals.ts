/** On-chain policy the user signs. Dollar amounts are plain USD; the frontend scales to 8 decimals. */
export type PolicyProposal = {
  maxTradeUsd: number;
  dailyLossCapBps: number;
  maxOracleDeviationBps: number;
  cooldownSeconds: number;
  maxOracleAge: number;
  allowedTokens: Array<'USDT' | 'WHSK' | 'WETH'>;
  rationale: string;
};

/** Off-chain agent knobs the user confirms in the UI. Only changed fields are present. */
export type StrategyProposal = {
  mode?: 'meanReversion' | 'momentum' | 'off';
  symbols?: Array<'WHSK' | 'WETH'>;
  tradeUsd?: number;
  edgeBps?: number;
  slippageBps?: number;
  loopSeconds?: number;
  minGapSeconds?: number;
  rationale: string;
};

const isInt = (x: unknown, lo: number, hi: number) => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const TOKENS = ['USDT', 'WHSK', 'WETH'];

/** Returns an error message for the model to fix, or null. Model output is untrusted input. */
export function validatePolicy(p: PolicyProposal): string | null {
  if (!(typeof p.maxTradeUsd === 'number' && p.maxTradeUsd > 0 && p.maxTradeUsd <= 10_000)) return 'maxTradeUsd must be a number in (0, 10000]';
  if (!isInt(p.dailyLossCapBps, 0, 10_000)) return 'dailyLossCapBps must be an integer in [0, 10000]';
  if (!isInt(p.maxOracleDeviationBps, 0, 10_000)) return 'maxOracleDeviationBps must be an integer in [0, 10000]';
  if (!isInt(p.cooldownSeconds, 0, 86_400)) return 'cooldownSeconds must be an integer in [0, 86400]';
  if (!isInt(p.maxOracleAge, 60, 604_800)) return 'maxOracleAge must be an integer in [60, 604800]';
  if (!Array.isArray(p.allowedTokens) || p.allowedTokens.some((t) => !TOKENS.includes(t))) return `allowedTokens must be a subset of ${TOKENS.join(', ')}`;
  if (new Set(p.allowedTokens).size !== p.allowedTokens.length) return 'allowedTokens has duplicates';
  return null;
}
