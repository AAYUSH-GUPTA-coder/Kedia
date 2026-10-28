"use client";

import { zeroAddress } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { hashkey } from "wagmi/chains";
import { factory } from "./config";

/** The connected wallet's vault from the factory: `vault` is undefined until it exists; `checked` is true once we know. */
export function useMyVault() {
  const { address } = useConnection();
  const q = useReadContract({ ...factory, chainId: hashkey.id, functionName: "vaultOf", args: [address ?? zeroAddress], query: { enabled: !!address } });
  const vault = q.data && q.data !== zeroAddress ? q.data : undefined;
  return { address, vault, checked: !!address && q.isSuccess, refetch: q.refetch };
}
