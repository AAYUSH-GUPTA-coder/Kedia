import type { NextConfig } from "next";

const network = process.env.NEXT_PUBLIC_KEDIA_NETWORK ?? "mainnet";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // NEXT_PUBLIC_KEDIA_NETWORK=testnet or fork reads that deployment's addresses instead of mainnet's.
    resolveAlias: ["testnet", "fork"].includes(network) ? { "@kedia/abi/addresses.json": `@kedia/abi/addresses.${network}.json` } : {},
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
