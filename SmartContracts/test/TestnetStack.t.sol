// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GuardedVault} from "../src/GuardedVault.sol";
import {ISupraSValueFeed} from "../src/interfaces/ISupraSValueFeed.sol";
import {TestToken} from "../src/testnet/TestToken.sol";
import {DeployTestnet} from "../script/DeployTestnet.s.sol";

/// @dev Stands in for Supra's testnet storage: fixed prices, always fresh. Pairs as in ABI/addresses.json.
contract MockSupra is ISupraSValueFeed {
    function getSvalue(uint256 pair) external view returns (priceFeed memory) {
        uint256 price = pair == 517 ? 0.0875e18 : pair == 1 ? 2250e18 : 0.9981e18;
        return priceFeed({round: block.timestamp, decimals: 18, time: block.timestamp * 1000, price: price});
    }
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160, uint32, uint256);
}

/// @dev Runs the testnet deployment on a plain local chain (no fork) and trades through the vendored Uniswap V3.
contract TestnetStackTest is Test {
    DeployTestnet.Deployed d;
    DeployTestnet script;
    address alice = makeAddr("alice");
    address agent = makeAddr("agent");

    function setUp() public {
        vm.warp(1_800_000_000);
        vm.etch(0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917, address(new MockSupra()).code);
        script = new DeployTestnet();
        vm.deal(address(script), 1 ether);
        // Outside a broadcast the script contract itself creates the demo vault, so it is the owner here.
        d = script.deploy(
            vm.readFile("../ABI/addresses.json"), makeAddr("demoAgent"), 0.05 ether, 5000e6, address(script)
        );
    }

    function _vaultWithUsdt(uint256 amount) internal returns (GuardedVault v) {
        vm.prank(alice);
        v = GuardedVault(d.factory.createVault(agent));
        vm.prank(alice);
        d.usdt.faucet(); // 100 USDT
        vm.startPrank(alice);
        IERC20(address(d.usdt)).approve(address(v), amount);
        v.deposit(address(d.usdt), amount);
        vm.stopPrank();
    }

    function test_QuoterPricesThePoolNearSupra() public {
        (uint256 out,,,) = IQuoterV2(d.quoter)
            .quoteExactInputSingle(
                IQuoterV2.QuoteExactInputSingleParams(address(d.usdt), address(d.whsk), 10e6, 3000, 0)
            );
        // $10 buys about 114 WHSK at $0.0875, less the 0.3% fee and a little impact.
        assertApproxEqRel(out, uint256(10e18) * 1e18 / 0.0875e18, 0.01e18);
    }

    function test_AgentTradesThroughVendoredRouter() public {
        GuardedVault v = _vaultWithUsdt(50e6);
        vm.prank(agent);
        uint256 out = v.executeSwap(address(d.usdt), address(d.whsk), 3000, 5e6, 0);
        assertGt(out, 50e18);
        assertEq(IERC20(address(d.whsk)).balanceOf(address(v)), out);
    }

    function test_GuardrailsStillApply() public {
        GuardedVault v = _vaultWithUsdt(50e6);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.TradeTooLarge.selector, uint256(49.905e8), uint256(10e8)));
        v.executeSwap(address(d.usdt), address(d.whsk), 3000, 50e6, 0);
    }

    function test_DemoVaultIsFundedAndOwned() public {
        GuardedVault demo = GuardedVault(d.demo);
        assertEq(demo.owner(), address(script));
        assertEq(makeAddr("demoAgent").balance, 0.05 ether);
        assertEq(IERC20(address(d.usdt)).balanceOf(d.demo), 30e6);
        assertEq(IERC20(address(d.whsk)).balanceOf(d.demo), 300e18);
    }

    function test_FaucetCooldown() public {
        vm.startPrank(alice);
        d.usdt.faucet();
        vm.expectRevert(abi.encodeWithSelector(TestToken.FaucetCooldown.selector, block.timestamp + 1 hours));
        d.usdt.faucet();
        vm.warp(block.timestamp + 1 hours);
        d.usdt.faucet();
        vm.stopPrank();
        assertEq(IERC20(address(d.usdt)).balanceOf(alice), 200e6);
    }
}
