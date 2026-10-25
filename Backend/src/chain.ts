import { createPublicClient, createWalletClient, http, parseAbi, BaseError, ContractFunctionRevertedError } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hashkey } from 'viem/chains';
import { guardedVaultAbi } from '@kedia/abi/GuardedVault';
import { OPERATOR_KEY, RPC_URL, VAULT } from './config.ts';

export const publicClient = createPublicClient({ chain: hashkey, transport: http(RPC_URL) });

let _wallet: ReturnType<typeof makeWallet> | undefined;
function makeWallet() {
  return createWalletClient({ chain: hashkey, transport: http(RPC_URL), account: privateKeyToAccount(OPERATOR_KEY()) });
}
/** Operator wallet. It can only call executeSwap; the vault rejects everything else it might try. */
export const wallet = () => (_wallet ??= makeWallet());

export const vault = { address: VAULT, abi: guardedVaultAbi } as const;

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
