import OpenAI from 'openai';
import { validatePolicy, type PolicyProposal, type StrategyProposal } from './proposals.ts';

export * from './proposals.ts';

/** Side effects the chat may trigger, supplied by the Backend. */
export type ChatActions = {
  getState(): Promise<unknown>;
  /** Validates and returns an error message, or null. */
  checkStrategy(s: StrategyProposal): string | null;
  /** Sends a real trade through the vault. The vault's limits decide whether it executes. */
  attemptTrade(a: { symbol: 'WHSK' | 'WETH'; side: 'buy' | 'sell'; amount: number; unit: 'usd' | 'asset' }): Promise<unknown>;
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type ChatResult = { reply: string; policy?: PolicyProposal; strategy?: StrategyProposal; trades: unknown[] };

// Claude Sonnet 5.5 through the Hopscotch Labs gateway. Hopscotch serves this model only on its
// OpenAI-compatible /v1/chat/completions (its /v1/messages refuses it), hence the openai client.
export const MODEL = process.env.HOPSCOTCH_MODEL ?? 'anthropic/claude-sonnet-5-5';
// Accept the bare origin too: the openai client appends /chat/completions, so /v1 must be on the end.
export const BASE_URL = (process.env.HOPSCOTCH_BASE_URL ?? 'https://api.hopscotchlabs.ai').replace(/\/+$/, '').replace(/(\/v1)?$/, '/v1');
const MAX_STEPS = 8;

const SYSTEM = `You are the risk desk for a crypto trading vault on HSK Chain. An autonomous agent trades WHSK/USDT and WETH/USDT on HSKSwap through the vault. The vault contract enforces the user's limits; nothing you say can change them without the user's wallet signature.

What you can do:
- get_state: read positions, P&L, the on-chain policy, the agent's strategy settings and recent decisions. Call it before answering about positions or proposing changes.
- propose_policy: propose a new on-chain policy. Always send the complete policy (all fields), derived from the current one. The user reviews the diff and signs it; you never apply it.
- propose_strategy: propose changes to the agent's off-chain settings (mode, symbols, trade size, edge, slippage, loop interval). Send only the fields that change. The user confirms it.
- attempt_trade: place one trade, only when the user explicitly asks you to trade. Do it even if it obviously breaks a limit: the point is to show the vault refusing it. Report the outcome plainly, including the revert name and transaction hash.

Trade sizes: pass the user's number as typed. Use unit 'asset' for token amounts and 'usd' for dollar amounts; never convert between them yourself. HSK means WHSK and ETH means WETH. If the vault lacks the balance, the tool says so; relay it.
Units: maxTradeUsd is in dollars. *Bps fields are basis points (100 bps = 1%). Times are seconds.
Mapping hints: "less risk" or "halve my risk" means lower maxTradeUsd and dailyLossCapBps (halve both for "halve"). "Stop trading X" means remove X from allowedTokens in the policy and from the agent's symbols. USDT is the quote token: keep it allowed unless the user asks to stop all trading, in which case suggest pausing.
Be brief. Use plain numbers with units.`;

const fn = (name: string, description: string, parameters: Record<string, unknown>): OpenAI.ChatCompletionTool => ({
  type: 'function',
  function: { name, description, parameters },
});

const tools: OpenAI.ChatCompletionTool[] = [
  fn('get_state', 'Read vault positions, equity, P&L, on-chain policy, agent strategy and recent decisions.', { type: 'object', properties: {} }),
  fn('propose_policy', 'Propose a complete new on-chain risk policy for the user to review and sign.', {
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
  }),
  fn('propose_strategy', "Propose changes to the agent's off-chain strategy settings. Include only fields that change.", {
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
  }),
  fn('attempt_trade', 'Send one real trade through the vault. Only when the user explicitly asks for a trade.', {
    type: 'object',
    properties: {
      symbol: { type: 'string', enum: ['WHSK', 'WETH'] },
      side: { type: 'string', enum: ['buy', 'sell'], description: 'buy = spend USDT for the asset' },
      amount: { type: 'number', description: 'Trade size, in the unit below' },
      unit: { type: 'string', enum: ['usd', 'asset'], description: "'usd' for dollar amounts ($10). 'asset' for token amounts (10 HSK, 0.002 ETH): sells spend exactly that many tokens." },
    },
    required: ['symbol', 'side', 'amount', 'unit'],
  }),
];

// Lazy: the backend and agent run without a key; only chat needs one.
let _client: OpenAI | undefined;
function client(): OpenAI {
  const apiKey = process.env.HOPSCOTCH_API_KEY;
  if (!apiKey) throw new Error('Set HOPSCOTCH_API_KEY in Backend/.env to use chat.');
  return (_client ??= new OpenAI({ baseURL: BASE_URL, apiKey }));
}

export async function chat(history: ChatTurn[], actions: ChatActions): Promise<ChatResult> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM },
    ...history.map((t) => ({ role: t.role, content: t.content })),
  ];
  const out: ChatResult = { reply: '', trades: [] };

  for (let step = 0; step < MAX_STEPS; step++) {
    // max_tokens sizes the credit Hopscotch holds per turn; Sonnet 5.5 thinks inside it.
    const res = await client().chat.completions.create({ model: MODEL, max_tokens: 16000, messages, tools });
    const choice = res.choices[0];
    const msg = choice.message;
    if (msg.refusal || choice.finish_reason === 'content_filter') return { ...out, reply: 'The model declined this request. Try rephrasing it.' };
    if (msg.content?.trim()) out.reply = msg.content.trim();
    const calls = (msg.tool_calls ?? []).filter((c) => c.type === 'function');
    if (calls.length === 0) {
      if (choice.finish_reason === 'length') out.reply ||= 'The reply was cut off. Ask a narrower question.';
      return out;
    }

    messages.push(msg);
    for (const call of calls) {
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(call.function.arguments || '{}');
      } catch {
        messages.push({ role: 'tool', tool_call_id: call.id, content: 'Error: arguments were not valid JSON. Send them again.' });
        continue;
      }
      const { content, isError } = await runTool(call.function.name, input, actions, out);
      messages.push({ role: 'tool', tool_call_id: call.id, content: isError ? `Error: ${content}` : content });
    }
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
