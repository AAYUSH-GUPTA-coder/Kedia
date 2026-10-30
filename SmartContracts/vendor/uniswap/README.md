# Uniswap V3 bytecode (testnet only)

HSK testnet has no HSKSwap, so `script/DeployTestnet.s.sol` deploys the official Uniswap V3 contracts that HSKSwap is forked from. These files hold the unmodified creation bytecode from the published npm packages, so the pool init-code hash the router and quoter rely on (`0xe34f199b…8b54`) matches:

| File | Package |
|---|---|
| `UniswapV3Factory.json` | `@uniswap/v3-core@1.0.1` |
| `SwapRouter02.json` | `@uniswap/swap-router-contracts@1.3.1` |
| `QuoterV2.json` | `@uniswap/v3-periphery@1.4.4` |
