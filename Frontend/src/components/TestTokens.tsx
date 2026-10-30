"use client";

import { parseAbi, type Address } from "viem";
import { writeContract } from "wagmi/actions";
import { cfg, chain, TESTNET, wagmiConfig } from "@/lib/config";
import { useVaultTx } from "@/lib/useVaultTx";
import { Button, TxResult } from "./ui";

const faucetAbi = parseAbi(["function faucet()"]);

/** Testnet only: claims test USDT and WHSK from their faucets (once an hour each), and links to the HSK gas faucet. */
export function TestTokens({ onDone }: { onDone?: () => void }) {
  const tx = useVaultTx(onDone);
  if (!TESTNET) return null;
  const claim = (sym: "USDT" | "WHSK") => () =>
    writeContract(wagmiConfig, { address: cfg.tokens[sym].address as Address, abi: faucetAbi, functionName: "faucet", chainId: chain.id });
  return (
    <div className="text-xs text-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button disabled={!!tx.busy} onClick={() => void tx.send("Get test tokens", claim("USDT"), claim("WHSK"))}>
          {tx.busy ? "Confirm in wallet…" : "Get test tokens"}
        </Button>
        <span>100 USDT + 1,000 WHSK, once an hour.</span>
        {cfg.faucetUrl && <a className="underline decoration-line-strong underline-offset-2 hover:text-fg" href={cfg.faucetUrl} target="_blank" rel="noreferrer">Testnet HSK for gas</a>}
      </div>
      <TxResult result={tx.result} />
    </div>
  );
}
