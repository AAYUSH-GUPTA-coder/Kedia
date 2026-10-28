import { createPublicClient, createWalletClient, encodePacked, http, keccak256, nonceManager, parseAbi, BaseError, ContractFunctionRevertedError } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hashkey } from 'viem/chains';
import type { Address } from 'viem';
import { guardedVaultAbi } from '@kedia/abi/GuardedVault';
import { vaultFactoryAbi } from '@kedia/abi/VaultFactory';
import { AGENT_MASTER_KEY, FACTORY, RPC_URL } from './config.ts';

export const publicClient = createPublicClient({ chain: hashkey, transport: http(RPC_URL) });

export const vaultAt = (address: Address) => ({ address, abi: guardedVaultAbi }) as const;
export const factory = { address: FACTORY, abi: vaultFactoryAbi } as const;

/** Private key of the agent wallet for vaults created by `creator`. Same derivation as script/Deploy.s.sol. */
const agentKey = (creator: Address) => keccak256(encodePacked(['bytes32', 'address'], [AGENT_MASTER_KEY(), creator]));
const makeAgent = (creator: Address) =>
  createWalletClient({ chain: hashkey, transport: http(RPC_URL), account: privateKeyToAccount(agentKey(creator), { nonceManager }) });
const agents = new Map<Address, ReturnType<typeof makeAgent>>();
const creators = new Map<Address, Address>();

/** Agent wallet for a vault creator. It can only call executeSwap on its own vault; the vault rejects everything else. */
export function agentFor(creator: Address) {
  let a = agents.get(creator);
  if (!a) agents.set(creator, (a = makeAgent(creator)));
  return a;
}

/** The agent wallet meant to operate `vault`, from the factory's record of who created it (which never changes). */
export async function agentOf(vault: Address) {
  let c = creators.get(vault);
  if (!c) creators.set(vault, (c = await publicClient.readContract({ ...factory, functionName: 'creatorOf', args: [vault] })));
  return agentFor(c);
}
/** Every vault created through the factory, checksummed. */
export const listVaults = () => publicClient.readContract({ ...factory, functionName: 'allVaults' });

export const feedAbi = parseAbi([
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
]);
export const quoterAbi = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

/** Turns a viem revert into the vault's custom error name and args, e.g. TradeTooLarge(usdIn, max). */
export function decodeRevert(err: unknown): { name: string; args: string[] } {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return { name: revert.data?.errorName ?? revert.reason ?? 'Reverted', args: (revert.data?.args ?? []).map(String) };
    }
    return { name: 'Error', args: [err.shortMessage] };
  }
  return { name: 'Error', args: [String(err)] };
}
