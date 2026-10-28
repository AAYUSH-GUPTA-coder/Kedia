import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Address } from 'viem';
import { hashkey } from 'viem/chains';
import { generateSiweNonce, parseSiweMessage } from 'viem/siwe';
import { FRONTEND_ORIGIN } from './config.ts';
import { publicClient } from './chain.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const NONCE_MS = 5 * 60_000;
const SESSION_MS = 24 * 3600_000;
const nonces = new Map<string, number>(); // nonce => expiry
const sessions = new Map<string, { owner: Address; exp: number }>(); // token => session
const prune = (m: Map<string, number | { exp: number }>) => {
  for (const [k, v] of m) if ((typeof v === 'number' ? v : v.exp) < Date.now()) m.delete(k);
};

/** Step 1 of Sign-In with Ethereum: a one-time nonce the wallet signs into its message. */
export function newNonce() {
  prune(nonces);
  const nonce = generateSiweNonce();
  nonces.set(nonce, Date.now() + NONCE_MS);
  return { nonce };
}

/** Step 2: checks the signed message (our nonce, our domain, HSK Chain, not expired) and returns a session token. */
export async function login(body: { message?: unknown; signature?: unknown }) {
  const { message, signature } = body;
  if (typeof message !== 'string' || typeof signature !== 'string' || !signature.startsWith('0x')) throw new HttpError(400, 'message and signature required');
  const fields = parseSiweMessage(message);
  const nonceExp = fields.nonce ? nonces.get(fields.nonce) : undefined;
  if (!fields.nonce || !nonceExp || nonceExp < Date.now()) throw new HttpError(401, 'Sign-in request expired. Try again.');
  nonces.delete(fields.nonce); // single use
  if (fields.chainId !== hashkey.id || !fields.address) throw new HttpError(401, 'Sign-in must be for HSK Chain.');
  const ok = await publicClient.verifySiweMessage({
    message, signature: signature as `0x${string}`, domain: new URL(FRONTEND_ORIGIN).host, nonce: fields.nonce,
  });
  if (!ok) throw new HttpError(401, 'Signature did not verify.');
  prune(sessions);
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { owner: fields.address, exp: Date.now() + SESSION_MS });
  return { token, owner: fields.address };
}

/** The wallet that signed in for this request's bearer token. */
export function ownerOf(req: IncomingMessage): Address {
  const token = req.headers.authorization?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
  const s = token ? sessions.get(token) : undefined;
  if (!s || s.exp < Date.now()) throw new HttpError(401, 'Sign in with your wallet first.');
  return s.owner;
}
