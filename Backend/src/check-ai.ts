// Checks the backend can read HOPSCOTCH_API_KEY from Backend/.env and reach the chat model.
// Uses the same .env loading (config.ts) and the same chat code as the running server. Costs one tiny request.
import './config.ts';
import { BASE_URL, MODEL, chat } from '@kedia/ai';

const key = process.env.HOPSCOTCH_API_KEY ?? '';
console.log(`key:   ${key ? `found in Backend/.env (${key.slice(0, 8)}…, ${key.length} chars)` : 'MISSING: set HOPSCOTCH_API_KEY in Backend/.env'}`);
console.log(`model: ${MODEL}`);
console.log(`url:   ${BASE_URL}`);
if (!key) process.exit(1);

const t0 = Date.now();
try {
  const noTools = { getState: async () => ({}), checkStrategy: () => null, attemptTrade: async () => { throw new Error('not in this check'); } };
  const r = await chat([{ role: 'user', content: 'Reply with exactly: Hopscotch connection OK' }], noTools);
  console.log(`reply: ${r.reply} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
} catch (e) {
  const err = e as { status?: number; message?: string; requestID?: string };
  console.error(`FAILED: ${err.status ?? ''} ${err.message ?? e}${err.requestID ? ` (Hopscotch request id ${err.requestID})` : ''}`);
  process.exit(1);
}
