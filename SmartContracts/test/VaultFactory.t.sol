// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {GuardedVault} from "../src/GuardedVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {SupraFeedAdapter} from "../src/SupraFeedAdapter.sol";
import {ISwapRouter02} from "../src/interfaces/ISwapRouter02.sol";
import {ISupraSValueFeed} from "../src/interfaces/ISupraSValueFeed.sol";

/// @dev Runs against a fork of HSK Chain mainnet, like GuardedVaultTest.
contract VaultFactoryTest is Test {
    ISwapRouter02 constant ROUTER = ISwapRouter02(0x2c16f75b95Cf1390c328aB70e2CEE7f4b80bD8F3);
    ISupraSValueFeed constant SUPRA = ISupraSValueFeed(0x58e158c74DF7Ad6396C0dcbadc4878faC9e93d57);
    address constant USDT = 0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029;
    address constant WHSK = 0xB210D2120d57b758EE163cFfb43e73728c471Cf1;
    address constant WETH = 0xefd4bC9afD210517803f293ABABd701CaeeCdfd0;

    address operator = makeAddr("operator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    VaultFactory factory;
    address[] feeds;

    function setUp() public {
        vm.createSelectFork("hsk");
        feeds.push(address(new SupraFeedAdapter(SUPRA, 48, "USDT/USD")));
        feeds.push(address(new SupraFeedAdapter(SUPRA, 517, "HSK/USDT")));
        feeds.push(address(new SupraFeedAdapter(SUPRA, 1, "ETH/USDT")));
        address[] memory tokens = new address[](3);
        (tokens[0], tokens[1], tokens[2]) = (USDT, WHSK, WETH);
        GuardedVault.Policy memory p = GuardedVault.Policy({
            maxTradeUsd: 10e8,
            dailyLossCapBps: 500,
            maxOracleDeviationBps: 500,
            cooldownSeconds: 0,
            maxOracleAge: 93_600
        });
        factory = new VaultFactory(ROUTER, operator, p, tokens, feeds);
    }

    function _create(address who) internal returns (GuardedVault) {
        vm.prank(who);
        return GuardedVault(factory.createVault());
    }

    function test_CreateVaultIsOwnedByCaller() public {
        GuardedVault v = _create(alice);
        assertEq(v.owner(), alice);
        assertEq(v.operator(), operator);
        assertEq(factory.vaultOf(alice), address(v));
        assertEq(v.feedOf(USDT), feeds[0]);
        assertEq(v.feedOf(WHSK), feeds[1]);
        assertEq(v.feedOf(WETH), feeds[2]);
        assertEq(v.policy().maxTradeUsd, 10e8);
        assertEq(v.policy().cooldownSeconds, 0);
    }

    function test_OneVaultPerWallet() public {
        GuardedVault v = _create(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.VaultExists.selector, address(v)));
        factory.createVault();
    }

    function test_EachWalletGetsItsOwnVault() public {
        GuardedVault a = _create(alice);
        GuardedVault b = _create(bob);
        assertTrue(address(a) != address(b));
        assertEq(factory.vaultOf(bob), address(b));
        assertEq(factory.vaultCount(), 2);
        address[] memory all = factory.allVaults();
        assertEq(all[0], address(a));
        assertEq(all[1], address(b));
    }

    function test_FactoryKeepsNoControl() public {
        GuardedVault v = _create(alice);
        GuardedVault.Policy memory p = v.policy();
        vm.prank(address(factory));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(factory)));
        v.setPolicy(p);
    }

    function test_OperatorTradesButCannotWithdraw() public {
        GuardedVault v = _create(alice);
        deal(USDT, address(v), 30e6);
        vm.prank(operator);
        uint256 out = v.executeSwap(USDT, WHSK, 3000, 5e6, 0);
        assertGt(out, 0);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        v.withdraw(USDT, 1e6, operator);
    }

    function test_SetOperatorOnlyOwnerAndOnlyNewVaults() public {
        GuardedVault before = _create(alice);
        address agent2 = makeAddr("agent2");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        factory.setOperator(agent2);
        factory.setOperator(agent2);
        assertEq(_create(bob).operator(), agent2);
        assertEq(before.operator(), operator);
    }

    function test_FactoryFitsContractSizeLimit() public view {
        assertLt(address(factory).code.length, 24_576);
    }
}
