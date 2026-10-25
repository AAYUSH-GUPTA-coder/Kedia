// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// @notice Supra oracle storage on HSK Chain (0x58e158c74DF7Ad6396C0dcbadc4878faC9e93d57). Readable by any contract.
interface ISupraSValueFeed {
    struct priceFeed {
        uint256 round;
        uint256 decimals;
        uint256 time; // milliseconds
        uint256 price;
    }

    function getSvalue(uint256 pairIndex) external view returns (priceFeed memory);
}
