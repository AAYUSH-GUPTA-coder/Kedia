// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {GuardedVault} from "../src/GuardedVault.sol";
import {ISwapRouter02} from "../src/interfaces/ISwapRouter02.sol";
import {AggregatorV3Interface} from "../src/interfaces/AggregatorV3Interface.sol";
import {ISupraSValueFeed} from "../src/interfaces/ISupraSValueFeed.sol";
import {SupraFeedAdapter} from "../src/SupraFeedAdapter.sol";

/// @dev Runs against a fork of HSK Chain mainnet: real HSKSwap pools and real APRO feeds.
contract GuardedVaultTest is Test {
    ISwapRouter02 constant ROUTER = ISwapRouter02(0x2c16f75b95Cf1390c328aB70e2CEE7f4b80bD8F3);
    address constant WHSK = 0xB210D2120d57b758EE163cFfb43e73728c471Cf1;
    address constant WETH = 0xefd4bC9afD210517803f293ABABd701CaeeCdfd0;
    address constant USDT = 0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029;
    address constant WBTC = 0x6119CA49a79f5825C8B345F8d7aC36B272565b14;
    address constant APRO_HSK_USD = 0x86CE42c1b714149Dc3A7b17169EF67b5F78A224b;
    ISupraSValueFeed constant SUPRA = ISupraSValueFeed(0x58e158c74DF7Ad6396C0dcbadc4878faC9e93d57);
    address HSK_USD;
    address ETH_USD;
    address USDT_USD;
    uint24 constant FEE = 3000;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    GuardedVault vault;

    function setUp() public {
        vm.createSelectFork("hsk");
        HSK_USD = address(new SupraFeedAdapter(SUPRA, 517, "HSK/USDT"));
        ETH_USD = address(new SupraFeedAdapter(SUPRA, 1, "ETH/USDT"));
        USDT_USD = address(new SupraFeedAdapter(SUPRA, 48, "USDT/USD"));
        GuardedVault.Policy memory p = GuardedVault.Policy({
            maxTradeUsd: 10e8,
            dailyLossCapBps: 500,
            maxOracleDeviationBps: 500,
            cooldownSeconds: 300,
            maxOracleAge: 93_600
        });
        vault = new GuardedVault(owner, operator, ROUTER, p);
        vm.startPrank(owner);
        vault.setAllowedToken(USDT, USDT_USD);
        vault.setAllowedToken(WHSK, HSK_USD);
        vault.setAllowedToken(WETH, ETH_USD);
        vm.stopPrank();
        deal(USDT, address(vault), 30e6);
        deal(WHSK, address(vault), 100e18);
    }

    // ------------------------------------------------------------ helpers

    function _swap(address tIn, address tOut, uint256 amountIn) internal returns (uint256) {
        vm.prank(operator);
        return vault.executeSwap(tIn, tOut, FEE, amountIn, 0);
    }

    /// @dev Re-publish a feed at `bps` of its real price with a fresh timestamp.
    function _mockFeed(address feed, uint256 bps) internal {
        (uint80 r, int256 a,,, uint80 ar) = AggregatorV3Interface(feed).latestRoundData();
        vm.mockCall(
            feed,
            abi.encodeWithSelector(AggregatorV3Interface.latestRoundData.selector),
            abi.encode(r, a * int256(bps) / 10_000, block.timestamp, block.timestamp, ar)
        );
    }

    /// @dev Make every feed look fresh after a large vm.warp (current answers, including mocked ones, unchanged).
    function _freshFeeds() internal {
        address[3] memory feeds = [HSK_USD, ETH_USD, USDT_USD];
        for (uint256 i; i < 3; ++i) {
            (uint80 r, int256 a,,, uint80 ar) = AggregatorV3Interface(feeds[i]).latestRoundData();
            vm.mockCall(
                feeds[i],
                abi.encodeWithSelector(AggregatorV3Interface.latestRoundData.selector),
                abi.encode(r, a, block.timestamp, block.timestamp, ar)
            );
        }
    }

    // ------------------------------------------------------------ oracles

    /// @dev Documents why the adapter exists: APRO answers EOAs but not unlisted contracts.
    function test_aproRejectsContractsButAgreesWithSupra() public {
        vm.expectRevert(bytes("No access"));
        AggregatorV3Interface(APRO_HSK_USD).latestRoundData();

        address eoa = makeAddr("eoa");
        vm.prank(eoa, eoa);
        (, int256 apro,,,) = AggregatorV3Interface(APRO_HSK_USD).latestRoundData();
        (, int256 supra,, uint256 updatedAt,) = AggregatorV3Interface(HSK_USD).latestRoundData();
        assertApproxEqRel(uint256(supra), uint256(apro), 0.03e18);
        assertLe(updatedAt, block.timestamp);
        assertEq(AggregatorV3Interface(HSK_USD).decimals(), 8);
    }

    // ------------------------------------------------------------ happy paths

    function test_buyWhskWithUsdt() public {
        uint256 whskBefore = IERC20(WHSK).balanceOf(address(vault));
        uint256 out = _swap(USDT, WHSK, 5e6);
        assertGt(out, 0);
        assertEq(IERC20(USDT).balanceOf(address(vault)), 25e6);
        assertEq(IERC20(WHSK).balanceOf(address(vault)), whskBefore + out);
        assertEq(IERC20(USDT).allowance(address(vault), address(ROUTER)), 0);
        assertEq(vault.lastTradeAt(), block.timestamp);
        assertGt(vault.dayStartEquity(), 0);
    }

    function test_sellWhskAndBuyWeth() public {
        _swap(WHSK, USDT, 50e18);
        vm.warp(block.timestamp + 301);
        assertGt(_swap(USDT, WETH, 5e6), 0);
    }

    // ------------------------------------------------------------ access control

    function test_revert_notOperator() public {
        vm.expectRevert(GuardedVault.NotOperator.selector);
        vm.prank(owner);
        vault.executeSwap(USDT, WHSK, FEE, 1e6, 0);
    }

    function test_revert_operatorCannotLoosenPolicyOrWithdraw() public {
        GuardedVault.Policy memory loose = vault.policy();
        loose.maxTradeUsd = type(uint256).max;
        vm.startPrank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vault.setPolicy(loose);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vault.withdraw(USDT, 1e6, operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vault.setAllowedToken(WBTC, HSK_USD);
        vm.stopPrank();
    }

    function test_revert_paused() public {
        vm.prank(owner);
        vault.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        _swap(USDT, WHSK, 1e6);
    }

    // ------------------------------------------------------------ token list

    function test_revert_tokenNotAllowed() public {
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.TokenNotAllowed.selector, WBTC));
        _swap(USDT, WBTC, 1e6);
    }

    function test_revert_sameToken() public {
        vm.expectRevert(GuardedVault.SameToken.selector);
        _swap(USDT, USDT, 1e6);
    }

    function test_removeTokenStopsTradingAndReaddDoesNotDuplicate() public {
        vm.prank(owner);
        vault.setAllowedToken(WETH, address(0));
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.TokenNotAllowed.selector, WETH));
        _swap(USDT, WETH, 1e6);

        vm.prank(owner);
        vault.setAllowedToken(WETH, ETH_USD);
        (address[] memory tokens,) = vault.allowedTokenList();
        assertEq(tokens.length, 3);
        _swap(USDT, WETH, 1e6);
    }

    // ------------------------------------------------------------ limits

    function test_revert_tradeTooLarge() public {
        (, int256 usdtPrice,,,) = AggregatorV3Interface(USDT_USD).latestRoundData();
        uint256 usdIn = 20e6 * uint256(usdtPrice) / 1e6;
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.TradeTooLarge.selector, usdIn, 10e8));
        _swap(USDT, WHSK, 20e6);
    }

    function test_oversizedTradeReportsSizeEvenDuringCooldown() public {
        _swap(USDT, WHSK, 1e6);
        vm.expectPartialRevert(GuardedVault.TradeTooLarge.selector);
        _swap(USDT, WHSK, 20e6);
    }

    function test_revert_cooldown() public {
        _swap(USDT, WHSK, 1e6);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.CooldownActive.selector, block.timestamp + 300));
        _swap(USDT, WHSK, 1e6);
        vm.warp(block.timestamp + 300);
        _swap(USDT, WHSK, 1e6);
    }

    function test_revert_staleOracle() public {
        (,,, uint256 updatedAt,) = AggregatorV3Interface(USDT_USD).latestRoundData();
        vm.warp(updatedAt + 93_601);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.StaleOracle.selector, USDT_USD, updatedAt));
        _swap(USDT, WHSK, 1e6);
    }

    /// @dev The oracle says HSK is worth 10% less than the pool pays: buying WHSK yields too little value.
    function test_revert_executionPriceDeviates_oracleMismatch() public {
        _mockFeed(HSK_USD, 9000);
        vm.expectPartialRevert(GuardedVault.ExecutionPriceDeviates.selector);
        _swap(USDT, WHSK, 5e6);
    }

    /// @dev An attacker dumps WHSK into the thin pool; the vault refuses to sell into the crashed price.
    function test_revert_executionPriceDeviates_manipulatedPool() public {
        address attacker = makeAddr("attacker");
        deal(WHSK, attacker, 1_000_000e18);
        vm.startPrank(attacker);
        IERC20(WHSK).approve(address(ROUTER), type(uint256).max);
        ROUTER.exactInputSingle(ISwapRouter02.ExactInputSingleParams(WHSK, USDT, FEE, attacker, 1_000_000e18, 0, 0));
        vm.stopPrank();

        vm.expectPartialRevert(GuardedVault.ExecutionPriceDeviates.selector);
        _swap(WHSK, USDT, 50e18);
    }

    function test_revert_dailyLossCap_thenResetsNextDay() public {
        deal(WHSK, address(vault), 300e18); // ~$26 of WHSK + $30 USDT
        _swap(USDT, WETH, 1e6); // snapshots today's baseline
        uint256 baseline = vault.dayStartEquity();

        // HSK crashes 50%: equity drops ~23%, beyond the 5% cap.
        vm.warp(block.timestamp + 301);
        _mockFeed(HSK_USD, 5000);
        vm.expectPartialRevert(GuardedVault.DailyLossCapBreached.selector);
        _swap(USDT, WETH, 1e6);
        assertEq(vault.lossFloor(), baseline * 9500 / 10_000);

        // Next UTC day: new baseline at the lower equity, trading resumes.
        vm.warp(block.timestamp + 1 days);
        _freshFeeds(); // keeps HSK at the crashed price
        _swap(USDT, WETH, 1e6);
        assertLt(vault.dayStartEquity(), baseline);
    }

    function test_withdrawRebaselinesStopLoss() public {
        _swap(USDT, WETH, 1e6);
        uint256 before = vault.dayStartEquity();
        vm.prank(owner);
        vault.withdraw(USDT, 20e6, owner);
        assertEq(vault.dayIndex(), 0);
        vm.warp(block.timestamp + 301);
        _swap(USDT, WETH, 1e6); // would breach vs the old baseline; passes on the new one
        assertLt(vault.dayStartEquity(), before);
    }

    function test_withdrawWorksWithStaleOracle() public {
        vm.warp(block.timestamp + 365 days);
        vm.prank(owner);
        vault.withdraw(WHSK, 100e18, owner);
        assertEq(IERC20(WHSK).balanceOf(owner), 100e18);
    }

    function test_depositPullsFromOwner() public {
        deal(USDT, owner, 10e6);
        vm.startPrank(owner);
        IERC20(USDT).approve(address(vault), 10e6);
        vault.deposit(USDT, 10e6);
        vm.stopPrank();
        assertEq(IERC20(USDT).balanceOf(address(vault)), 40e6);
    }

    /// @dev "Halve my risk and stop trading WETH" applied as one owner signature.
    function test_ownerBatchesPolicyChangeWithMulticall() public {
        GuardedVault.Policy memory p = vault.policy();
        p.maxTradeUsd /= 2;
        p.dailyLossCapBps /= 2;
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(GuardedVault.setPolicy, (p));
        calls[1] = abi.encodeCall(GuardedVault.setAllowedToken, (WETH, address(0)));
        vm.prank(owner);
        vault.multicall(calls);
        assertEq(vault.policy().maxTradeUsd, 5e8);
        assertEq(vault.feedOf(WETH), address(0));

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vault.multicall(calls);
    }

    function test_revert_invalidPolicy() public {
        GuardedVault.Policy memory p = vault.policy();
        p.dailyLossCapBps = 10_001;
        vm.expectRevert(GuardedVault.InvalidPolicy.selector);
        vm.prank(owner);
        vault.setPolicy(p);
    }
}
