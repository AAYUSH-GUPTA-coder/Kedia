import { parseAbiItem, type Address } from 'viem';
import { cfg } from './config.ts';
import { listVaults, publicClient } from './chain.ts';

// eth_getLogs block-range caps: mainnet.hsk.xyz allows 100k blocks, testnet.hsk.xyz only about 5k.
const MAX_RANGE = cfg.chainId === 133 ? 5_000n : 100_000n;
const deposited = parseAbiItem('event Deposited(address indexed token, uint256 amount, uint256 usdValue)');
const withdrawn = parseAbiItem('event Withdrawn(address indexed token, uint256 amount, uint256 usdValue, address to)');

let scanned = BigInt(cfg.deployBlock) - 1n;
const net8 = new Map<string, bigint>(); // lowercase vault => net deposits, 8-decimal USD

/** USD (oracle value at the time) deposited minus withdrawn through `vault`. One incremental scan covers every vault. */
export async function netDepositsUsd(vault: Address): Promise<number> {
  // Head before the vault list: any vault created up to head is in the list, and its deposits come after it.
  const head = await publicClient.getBlockNumber();
  const vaults = [...(await listVaults())];
  while (scanned < head) {
    const fromBlock = scanned + 1n;
    const toBlock = fromBlock + MAX_RANGE - 1n < head ? fromBlock + MAX_RANGE - 1n : head;
    if (vaults.length) {
      const [d, w] = await Promise.all([
        publicClient.getLogs({ address: vaults, event: deposited, fromBlock, toBlock }),
        publicClient.getLogs({ address: vaults, event: withdrawn, fromBlock, toBlock }),
      ]);
      const add = (a: string, x: bigint) => net8.set(a.toLowerCase(), (net8.get(a.toLowerCase()) ?? 0n) + x);
      for (const l of d) add(l.address, l.args.usdValue ?? 0n);
      for (const l of w) add(l.address, -(l.args.usdValue ?? 0n));
    }
    scanned = toBlock;
  }
  return Number(net8.get(vault.toLowerCase()) ?? 0n) / 1e8;
}
