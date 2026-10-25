import { parseAbiItem } from 'viem';
import { cfg, VAULT } from './config.ts';
import { publicClient } from './chain.ts';

const MAX_RANGE = 100_000n; // mainnet.hsk.xyz caps eth_getLogs at 100k blocks
const deposited = parseAbiItem('event Deposited(address indexed token, uint256 amount, uint256 usdValue)');
const withdrawn = parseAbiItem('event Withdrawn(address indexed token, uint256 amount, uint256 usdValue, address to)');

let scanned = BigInt(cfg.deployBlock) - 1n;
let netDeposits8 = 0n;

/** USD (oracle value at the time) deposited minus withdrawn through the vault. Scans new blocks incrementally. */
export async function netDepositsUsd(): Promise<number> {
  const head = await publicClient.getBlockNumber();
  while (scanned < head) {
    const fromBlock = scanned + 1n;
    const toBlock = fromBlock + MAX_RANGE - 1n < head ? fromBlock + MAX_RANGE - 1n : head;
    const [d, w] = await Promise.all([
      publicClient.getLogs({ address: VAULT, event: deposited, fromBlock, toBlock }),
      publicClient.getLogs({ address: VAULT, event: withdrawn, fromBlock, toBlock }),
    ]);
    for (const l of d) netDeposits8 += l.args.usdValue ?? 0n;
    for (const l of w) netDeposits8 -= l.args.usdValue ?? 0n;
    scanned = toBlock;
  }
  return Number(netDeposits8) / 1e8;
}
