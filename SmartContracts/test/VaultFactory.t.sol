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

    address agentA = makeAddr("agentA");
    address agentB = makeAddr("agentB");
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
        factory = new VaultFactory(ROUTER, p, tokens, feeds);
    }

    function _create(address who, address agent) internal returns (GuardedVault) {
        vm.prank(who);
        return GuardedVault(factory.createVault(agent));
    }

    function test_CreateVaultIsOwnedByCaller() public {
        GuardedVault v = _create(alice, agentA);
        assertEq(v.owner(), alice);
        assertEq(v.operator(), agentA);
        assertEq(factory.vaultOf(alice), address(v));
        assertEq(factory.creatorOf(address(v)), alice);
        assertEq(v.feedOf(USDT), feeds[0]);
        assertEq(v.feedOf(WHSK), feeds[1]);
        assertEq(v.feedOf(WETH), feeds[2]);
        assertEq(v.policy().maxTradeUsd, 10e8);
        assertEq(v.policy().cooldownSeconds, 0);
    }

    function test_OneVaultPerWallet() public {
        GuardedVault v = _create(alice, agentA);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.VaultExists.selector, address(v)));
        factory.createVault(agentA);
    }

    function test_EachWalletGetsItsOwnVault() public {
        GuardedVault a = _create(alice, agentA);
        GuardedVault b = _create(bob, agentB);
        assertTrue(address(a) != address(b));
        assertEq(b.operator(), agentB);
        assertEq(factory.vaultOf(bob), address(b));
        assertEq(factory.vaultCount(), 2);
        address[] memory all = factory.allVaults();
        assertEq(all[0], address(a));
        assertEq(all[1], address(b));
    }

    function test_FactoryKeepsNoControl() public {
        GuardedVault v = _create(alice, agentA);
        GuardedVault.Policy memory p = v.policy();
        vm.prank(address(factory));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(factory)));
        v.setPolicy(p);
    }

    function test_OperatorTradesButCannotWithdraw() public {
        GuardedVault v = _create(alice, agentA);
        deal(USDT, address(v), 30e6);
        vm.prank(agentA);
        uint256 out = v.executeSwap(USDT, WHSK, 3000, 5e6, 0);
        assertGt(out, 0);
        vm.prank(agentA);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agentA));
        v.withdraw(USDT, 1e6, agentA);
    }

    function test_AgentOfOneVaultCannotTradeAnother() public {
        _create(alice, agentA);
        GuardedVault b = _create(bob, agentB);
        deal(USDT, address(b), 30e6);
        vm.prank(agentA);
        vm.expectRevert(GuardedVault.NotOperator.selector);
        b.executeSwap(USDT, WHSK, 3000, 5e6, 0);
    }

    function test_CreateVaultFundsTheAgent() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        factory.createVault{value: 3 ether}(agentA);
        assertEq(agentA.balance, 3 ether);
        assertEq(address(factory).balance, 0);
    }

    function test_RevertWhen_AgentIsZero() public {
        vm.prank(alice);
        vm.expectRevert(VaultFactory.ZeroAgent.selector);
        factory.createVault(address(0));
    }

    function test_RevertWhen_AgentRejectsFunding() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(VaultFactory.AgentFundingFailed.selector);
        factory.createVault{value: 1 ether}(address(factory)); // no receive(), so the transfer fails
    }

    function test_FactoryFitsContractSizeLimit() public view {
        assertLt(address(factory).code.length, 24_576);
    }
}
