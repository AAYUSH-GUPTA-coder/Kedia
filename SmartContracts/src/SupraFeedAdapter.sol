// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {ISupraSValueFeed} from "./interfaces/ISupraSValueFeed.sol";

/**
 * @title SupraFeedAdapter
 * @author Aayush Gupta
 * @notice Exposes one Supra pair as an 8-decimal AggregatorV3 feed so GuardedVault can use it.
 * @dev APRO feeds on HSK Chain are behind a read-access whitelist (contracts get "No access"),
 *      so the vault reads Supra through this adapter until APRO whitelists it; switching back is
 *      one owner call to GuardedVault.setAllowedToken(token, aproFeed).
 */
contract SupraFeedAdapter is AggregatorV3Interface {
    ISupraSValueFeed public immutable supra;
    uint256 public immutable pairIndex;
    string public description;

    constructor(ISupraSValueFeed supra_, uint256 pairIndex_, string memory description_) {
        supra = supra_;
        pairIndex = pairIndex_;
        description = description_;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        ISupraSValueFeed.priceFeed memory f = supra.getSvalue(pairIndex);
        uint256 price = f.decimals >= 8 ? f.price / 10 ** (f.decimals - 8) : f.price * 10 ** (8 - f.decimals);
        uint256 updatedAt = f.time / 1000;
        // forge-lint: disable-next-line(unsafe-typecast)
        return (uint80(f.round), int256(price), updatedAt, updatedAt, uint80(f.round)); // ms timestamps and 1e8-scaled prices fit
    }
}
