import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // NEXT_PUBLIC_KEDIA_NETWORK=fork shows the local fork deployment that SmartContracts/fork-setup.sh writes.
    resolveAlias: process.env.NEXT_PUBLIC_KEDIA_NETWORK === "fork" ? { "@kedia/abi/addresses.json": "@kedia/abi/addresses.fork.json" } : {},
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
