// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IUniswapV3FactoryMin {
    function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool);
}

interface IUniswapV3PoolMin {
    function token0() external view returns (address);
    function initialize(uint160 sqrtPriceX96) external;
    function mint(address recipient, int24 tickLower, int24 tickUpper, uint128 amount, bytes calldata data)
        external
        returns (uint256 amount0, uint256 amount1);
}

/**
 * @title PoolSeeder
 * @author Aayush Gupta
 * @notice Testnet only. Creates a Uniswap V3 pool at a given price and adds full-range liquidity from its own
 *         token balance, so the agent has real pools to trade on HSK testnet. The liquidity stays with this contract.
 */
contract PoolSeeder {
    using SafeERC20 for IERC20;

    // Full range for the 0.3% fee tier (tick spacing 60).
    int24 internal constant MIN_TICK = -887220;
    int24 internal constant MAX_TICK = 887220;
    uint256 internal constant Q96 = 2 ** 96;

    IUniswapV3FactoryMin public immutable factory;
    mapping(address => bool) internal _seeded;

    error NotSeededPool();

    constructor(IUniswapV3FactoryMin factory_) {
        factory = factory_;
    }

    /**
     * @notice Creates the `asset`/`quote` pool priced at `priceE18` (quote per whole asset, 18 decimals) and adds
     *         full-range liquidity worth about `quoteDepth` (raw quote units) on each side.
     */
    function seed(address asset, address quote, uint24 fee, uint256 priceE18, uint256 quoteDepth)
        external
        returns (address pool)
    {
        pool = factory.createPool(asset, quote, fee);
        bool assetIs0 = IUniswapV3PoolMin(pool).token0() == asset;
        uint160 sqrtPriceX96 = _sqrtPriceX96(asset, quote, assetIs0, priceE18);
        IUniswapV3PoolMin(pool).initialize(sqrtPriceX96);
        _seeded[pool] = true;
        IUniswapV3PoolMin(pool)
            .mint(
                address(this),
                MIN_TICK,
                MAX_TICK,
                _liquidity(assetIs0, sqrtPriceX96, quoteDepth),
                abi.encode(asset, quote)
            );
    }

    /// @dev Raw price of token0 in token1 is num/den; sqrtPriceX96 = sqrt(price * 2^192).
    function _sqrtPriceX96(address asset, address quote, bool assetIs0, uint256 priceE18)
        internal
        view
        returns (uint160)
    {
        uint256 a = priceE18 * 10 ** IERC20Metadata(quote).decimals();
        uint256 b = 1e18 * 10 ** IERC20Metadata(asset).decimals();
        (uint256 num, uint256 den) = assetIs0 ? (a, b) : (b, a);
        return uint160(Math.sqrt(Math.mulDiv(num, 2 ** 192, den)));
    }

    /// @dev Full range: amount1 ≈ L·sqrtP/2^96 and amount0 ≈ L·2^96/sqrtP, so L is sized from the quote side.
    function _liquidity(bool assetIs0, uint160 sqrtPriceX96, uint256 quoteDepth) internal pure returns (uint128) {
        return
            uint128(assetIs0 ? Math.mulDiv(quoteDepth, Q96, sqrtPriceX96) : Math.mulDiv(quoteDepth, sqrtPriceX96, Q96));
    }

    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata data) external {
        if (!_seeded[msg.sender]) revert NotSeededPool();
        (address asset, address quote) = abi.decode(data, (address, address));
        (address t0, address t1) = IUniswapV3PoolMin(msg.sender).token0() == asset ? (asset, quote) : (quote, asset);
        if (amount0Owed > 0) IERC20(t0).safeTransfer(msg.sender, amount0Owed);
        if (amount1Owed > 0) IERC20(t1).safeTransfer(msg.sender, amount1Owed);
    }
}
