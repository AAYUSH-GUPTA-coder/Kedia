import Anthropic from '@anthropic-ai/sdk';
import { validatePolicy, type PolicyProposal, type StrategyProposal } from './proposals.ts';

export * from './proposals.ts';

/** Side effects the chat may trigger, supplied by the Backend. */
export type ChatActions = {
  getState(): Promise<unknown>;
  /** Validates and returns an error message, or null. */
  checkStrategy(s: StrategyProposal): string | null;
  /** Sends a real trade through the vault. The vault's limits decide whether it executes. */
  attemptTrade(a: { symbol: 'WHSK' | 'WETH'; side: 'buy' | 'sell'; usd: number }): Promise<unknown>;
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type ChatResult = { reply: string; policy?: PolicyProposal; strategy?: StrategyProposal; trades: unknown[] };

// The user picked Sonnet for chat latency during planning; override with CLAUDE_MODEL.
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5-5';
const MAX_STEPS = 8;

const SYSTEM = `You are the risk desk for a crypto trading vault on HSK Chain. An autonomous agent trades WHSK/USDT and WETH/USDT on HSKSwap through the vault. The vault contract enforces the user's limits; nothing you say can change them without the user's wallet signature.

What you can do:
- get_state: read positions, P&L, the on-chain policy, the agent's strategy settings and recent decisions. Call it before answering about positions or proposing changes.
- propose_policy: propose a new on-chain policy. Always send the complete policy (all fields), derived from the current one. The user reviews the diff and signs it; you never apply it.
- propose_strategy: propose changes to the agent's off-chain settings (mode, symbols, trade size, edge, slippage, loop interval). Send only the fields that change. The user confirms it.
- attempt_trade: place one trade, only when the user explicitly asks you to trade. Do it even if it obviously breaks a limit: the point is to show the vault refusing it. Report the outcome plainly, including the revert name and transaction hash.

Units: maxTradeUsd is in dollars. *Bps fields are basis points (100 bps = 1%). Times are seconds.
Mapping hints: "less risk" or "halve my risk" means lower maxTradeUsd and dailyLossCapBps (halve both for "halve"). "Stop trading X" means remove X from allowedTokens in the policy and from the agent's symbols. USDT is the quote token: keep it allowed unless the user asks to stop all trading, in which case suggest pausing.
Be brief. Use plain numbers with units.`;

const tools: Anthropic.Beta.BetaTool[] = [
  { name: 'get_state', description: 'Read vault positions, equity, P&L, on-chain policy, agent strategy and recent decisions.', input_schema: { type: 'object', properties: {} } },
  {
    name: 'propose_policy',
    description: 'Propose a complete new on-chain risk policy for the user to review and sign.',
    input_schema: {
      type: 'object',
      properties: {
        maxTradeUsd: { type: 'number', description: 'Max USD value per trade' },
        dailyLossCapBps: { type: 'integer', description: 'Max daily drawdown of equity, in bps' },
        maxOracleDeviationBps: { type: 'integer', description: 'Max shortfall of fill value vs oracle value, in bps' },
        cooldownSeconds: { type: 'integer', description: 'Min seconds between trades' },
        maxOracleAge: { type: 'integer', description: 'Max oracle answer age in seconds' },
        allowedTokens: { type: 'array', items: { type: 'string', enum: ['USDT', 'WHSK', 'WETH'] } },
        rationale: { type: 'string', description: 'One sentence explaining the change' },
      },
      required: ['maxTradeUsd', 'dailyLossCapBps', 'maxOracleDeviationBps', 'cooldownSeconds', 'maxOracleAge', 'allowedTokens', 'rationale'],
    },
  },
  {
    name: 'propose_strategy',
    description: "Propose changes to the agent's off-chain strategy settings. Include only fields that change.",
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['meanReversion', 'momentum', 'off'] },
        symbols: { type: 'array', items: { type: 'string', enum: ['WHSK', 'WETH'] } },
        tradeUsd: { type: 'number', description: 'USD per trade (capped by the on-chain maxTradeUsd)' },
        edgeBps: { type: 'integer', description: 'Min price gap vs reference before trading, in bps' },
        slippageBps: { type: 'integer' },
        loopSeconds: { type: 'integer' },
        rationale: { type: 'string' },
      },
      required: ['rationale'],
    },
  },
  {
    name: 'attempt_trade',
    description: 'Send one real trade through the vault. Only when the user explicitly asks for a trade.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', enum: ['WHSK', 'WETH'] },
        side: { type: 'string', enum: ['buy', 'sell'], description: 'buy = spend USDT for the asset' },
        usd: { type: 'number', description: 'Trade size in USD' },
      },
      required: ['symbol', 'side', 'usd'],
    },
  },
];

let _client: Anthropic | undefined; // lazy: the backend runs without an API key, only chat needs one

export async function chat(history: ChatTurn[], actions: ChatActions): Promise<ChatResult> {
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
  const out: ChatResult = { reply: '', trades: [] };

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await (_client ??= new Anthropic()).beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools,
      messages,
      output_config: { effort: 'low' },
      // Retry classifier declines on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    if (res.stop_reason === 'refusal') return { ...out, reply: 'The model declined this request. Try rephrasing it.' };
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (text) out.reply = text;
    if (res.stop_reason !== 'tool_use' && res.stop_reason !== 'pause_turn') return out;

    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'pause_turn') continue;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of res.content) {
      if (call.type !== 'tool_use') continue;
      const { content, isError } = await runTool(call.name, call.input as Record<string, unknown>, actions, out);
      results.push({ type: 'tool_result', tool_use_id: call.id, content, is_error: isError });
    }
    messages.push({ role: 'user', content: results });
  }
  return { ...out, reply: out.reply || 'Stopped after too many steps.' };
}

async function runTool(name: string, input: Record<string, unknown>, actions: ChatActions, out: ChatResult): Promise<{ content: string; isError: boolean }> {
  const ok = (x: unknown) => ({ content: typeof x === 'string' ? x : JSON.stringify(x), isError: false });
  const fail = (msg: string) => ({ content: msg, isError: true });
  try {
    switch (name) {
      case 'get_state':
        return ok(await actions.getState());
      case 'propose_policy': {
        const p = input as PolicyProposal;
        const err = validatePolicy(p);
        if (err) return fail(err);
        out.policy = p;
        return ok('Shown to the user as a diff with a Sign button. Not applied until they sign.');
      }
      case 'propose_strategy': {
        const s = input as StrategyProposal;
        const err = actions.checkStrategy(s);
        if (err) return fail(err);
        out.strategy = s;
        return ok('Shown to the user with a Confirm button. Not applied until they confirm.');
      }
      case 'attempt_trade': {
        const r = await actions.attemptTrade(input as Parameters<ChatActions['attemptTrade']>[0]);
        out.trades.push(r);
        return ok(r);
      }
      default:
        return fail(`unknown tool ${name}`);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
