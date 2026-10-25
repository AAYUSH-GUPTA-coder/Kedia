// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @notice HSKSwap SwapRouter02 (Uniswap v3 fork). exactInputSingle has no deadline field (selector 0x04e45aaf).
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}
