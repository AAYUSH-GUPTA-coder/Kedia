// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {ISwapRouter02} from "./interfaces/ISwapRouter02.sol";

/**
 * @title GuardedVault
 * @author Aayush Gupta
 * @notice Holds the owner's funds. An AI agent holding only the operator key may swap on HSKSwap,
 *         but every trade must pass limits enforced here: allowed tokens, max trade size, cooldown,
 *         oracle staleness, a realized-price band vs the price oracle, and a daily loss cap (stop-loss).
 *         Only the owner can change the limits, pause, deposit or withdraw. The owner batches a policy
 *         change (setPolicy + setAllowedToken calls) into one signature with multicall.
 */
contract GuardedVault is Ownable, Pausable, ReentrancyGuardTransient, Multicall {
    using SafeERC20 for IERC20;

    /// @dev All USD values use 8 decimals (price feed precision). bps = 1/10000.
    struct Policy {
        uint256 maxTradeUsd; // max USD value of a single trade's input
        uint16 dailyLossCapBps; // max drawdown of oracle-marked equity vs the day-start snapshot
        uint16 maxOracleDeviationBps; // max shortfall of realized output value vs input value at oracle prices
        uint32 cooldownSeconds; // min seconds between trades
        uint32 maxOracleAge; // max age of an oracle answer
    }

    uint256 private constant BPS = 10_000;
    uint8 private constant FEED_DECIMALS = 8;

    ISwapRouter02 public immutable router;
    address public operator;
    Policy internal _policy;

    /// @notice token => APRO USD feed. address(0) means the token is not tradable and not counted in equity.
    mapping(address => address) public feedOf;
    mapping(address => uint8) public decimalsOf;
    mapping(address => bool) private _listed;
    address[] private _tokens;

    uint256 public lastTradeAt;
    /// @notice UTC day index of the current baseline. 0 forces a fresh snapshot on the next trade.
    uint256 public dayIndex;
    uint256 public dayStartEquity;

    event PolicyUpdated(Policy policy);
    event TokenSet(address indexed token, address feed);
    event OperatorSet(address indexed operator);
    event DayStarted(uint256 indexed dayIndex, uint256 equityUsd);
    event Deposited(address indexed token, uint256 amount, uint256 usdValue);
    event Withdrawn(address indexed token, uint256 amount, uint256 usdValue, address to);
    event TradeExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 usdIn,
        uint256 usdOut,
        uint256 equityAfter
    );

    error NotOperator();
    error TokenNotAllowed(address token);
    error SameToken();
    error CooldownActive(uint256 nextTradeAt);
    error StaleOracle(address feed, uint256 updatedAt);
    error InvalidOraclePrice(address feed);
    error BadFeedDecimals(address feed);
    error TradeTooLarge(uint256 usdIn, uint256 maxTradeUsd);
    error ExecutionPriceDeviates(uint256 usdIn, uint256 usdOut, uint256 minUsdOut);
    error DailyLossCapBreached(uint256 equityUsd, uint256 floorUsd);
    error InvalidPolicy();

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    constructor(address owner_, address operator_, ISwapRouter02 router_, Policy memory policy_) Ownable(owner_) {
        router = router_;
        _setOperator(operator_);
        _setPolicy(policy_);
    }

    /*//////////////////////////////////////////////////////////////
                                 OPERATOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Swap `amountIn` of `tokenIn` for `tokenOut` on HSKSwap through the vault's guardrails.
    function executeSwap(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint256 minAmountOut)
        external
        nonReentrant
        onlyOperator
        whenNotPaused
        returns (uint256 amountOut)
    {
        if (tokenIn == tokenOut) revert SameToken();
        if (feedOf[tokenIn] == address(0)) revert TokenNotAllowed(tokenIn);
        if (feedOf[tokenOut] == address(0)) revert TokenNotAllowed(tokenOut);
        Policy memory p = _policy;
        // Size before cooldown, so an oversized trade always reports TradeTooLarge.
        uint256 usdIn = _usd(tokenIn, amountIn, _price(tokenIn, p.maxOracleAge));
        if (usdIn > p.maxTradeUsd) revert TradeTooLarge(usdIn, p.maxTradeUsd);
        if (block.timestamp < lastTradeAt + p.cooldownSeconds) revert CooldownActive(lastTradeAt + p.cooldownSeconds);

        // Snapshot the stop-loss baseline before the first trade of each UTC day.
        uint256 today = block.timestamp / 1 days;
        if (today != dayIndex) {
            dayIndex = today;
            dayStartEquity = _equity(p.maxOracleAge);
            emit DayStarted(today, dayStartEquity);
        }

        IERC20(tokenIn).forceApprove(address(router), amountIn);
        amountOut = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        // A thin or manipulated pool cannot fill far from the oracle price.
        uint256 usdOut = _usd(tokenOut, amountOut, _price(tokenOut, p.maxOracleAge));
        uint256 minUsdOut = usdIn * (BPS - p.maxOracleDeviationBps) / BPS;
        if (usdOut < minUsdOut) revert ExecutionPriceDeviates(usdIn, usdOut, minUsdOut);

        // Checked after the swap so no single trade can push equity through the floor.
        uint256 equityAfter = _equity(p.maxOracleAge);
        uint256 floor = dayStartEquity * (BPS - p.dailyLossCapBps) / BPS;
        if (equityAfter < floor) revert DailyLossCapBreached(equityAfter, floor);

        lastTradeAt = block.timestamp;
        emit TradeExecuted(tokenIn, tokenOut, amountIn, amountOut, usdIn, usdOut, equityAfter);
    }

    /*//////////////////////////////////////////////////////////////
                                  OWNER
    //////////////////////////////////////////////////////////////*/

    function setPolicy(Policy calldata policy_) external onlyOwner {
        _setPolicy(policy_);
    }

    /// @notice Allow a token with its USD feed, or pass feed = address(0) to stop trading it.
    function setAllowedToken(address token, address feed) external onlyOwner {
        if (feed != address(0) && AggregatorV3Interface(feed).decimals() != FEED_DECIMALS) {
            revert BadFeedDecimals(feed);
        }
        if (!_listed[token]) {
            _listed[token] = true;
            _tokens.push(token);
            decimalsOf[token] = IERC20Metadata(token).decimals();
        }
        feedOf[token] = feed;
        dayIndex = 0; // the equity basket changed, so re-baseline the stop-loss
        emit TokenSet(token, feed);
    }

    function setOperator(address operator_) external onlyOwner {
        _setOperator(operator_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Owner-only so nobody else can reset the stop-loss baseline by depositing.
    function deposit(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        dayIndex = 0; // a deposit must not count as a trading gain or mask a loss
        emit Deposited(token, amount, _usdUnchecked(token, amount));
    }

    /// @notice Works for any token and never depends on the oracle, so funds can always leave.
    function withdraw(address token, uint256 amount, address to) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        dayIndex = 0; // withdrawals must not trip a false stop-loss
        emit Withdrawn(token, amount, _usdUnchecked(token, amount), to);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    function policy() external view returns (Policy memory) {
        return _policy;
    }

    function allowedTokenList() external view returns (address[] memory tokens, address[] memory feeds) {
        tokens = _tokens;
        feeds = new address[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) {
            feeds[i] = feedOf[tokens[i]];
        }
    }

    /// @notice Oracle-marked USD value (8 decimals) of all allowed tokens held. Reverts if a feed is stale.
    function equity() external view returns (uint256) {
        return _equity(_policy.maxOracleAge);
    }

    /// @notice Lowest equity today's trades may leave the vault at (0 until the day's first trade).
    function lossFloor() external view returns (uint256) {
        if (dayIndex != block.timestamp / 1 days) return 0;
        return dayStartEquity * (BPS - _policy.dailyLossCapBps) / BPS;
    }

    /*//////////////////////////////////////////////////////////////
                                 INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _setPolicy(Policy memory p) internal {
        if (p.dailyLossCapBps > BPS || p.maxOracleDeviationBps > BPS || p.maxOracleAge == 0) revert InvalidPolicy();
        _policy = p;
        emit PolicyUpdated(p);
    }

    function _setOperator(address operator_) internal {
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function _price(address token, uint256 maxAge) internal view returns (uint256) {
        address feed = feedOf[token];
        (, int256 answer,, uint256 updatedAt,) = AggregatorV3Interface(feed).latestRoundData();
        if (answer <= 0) revert InvalidOraclePrice(feed);
        if (updatedAt + maxAge < block.timestamp) revert StaleOracle(feed, updatedAt);
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(answer); // answer > 0 checked above
    }

    function _usd(address token, uint256 amount, uint256 price) internal view returns (uint256) {
        return amount * price / 10 ** decimalsOf[token];
    }

    function _equity(uint256 maxAge) internal view returns (uint256 total) {
        uint256 n = _tokens.length;
        for (uint256 i; i < n; ++i) {
            address token = _tokens[i];
            if (feedOf[token] == address(0)) continue;
            uint256 bal = IERC20(token).balanceOf(address(this));
            if (bal != 0) total += _usd(token, bal, _price(token, maxAge));
        }
    }

    /// @dev Best-effort value for deposit/withdraw events; returns 0 instead of reverting.
    function _usdUnchecked(address token, uint256 amount) internal view returns (uint256) {
        address feed = feedOf[token];
        if (feed == address(0)) return 0;
        try AggregatorV3Interface(feed).latestRoundData() returns (uint80, int256 answer, uint256, uint256, uint80) {
            // forge-lint: disable-next-line(unsafe-typecast)
            return answer > 0 ? _usd(token, amount, uint256(answer)) : 0;
        } catch {
            return 0;
        }
    }
}
