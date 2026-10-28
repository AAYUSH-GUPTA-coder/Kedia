// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Script, console} from "forge-std/Script.sol";
import {GuardedVault} from "../src/GuardedVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {SupraFeedAdapter} from "../src/SupraFeedAdapter.sol";
import {ISupraSValueFeed} from "../src/interfaces/ISupraSValueFeed.sol";
import {ISwapRouter02} from "../src/interfaces/ISwapRouter02.sol";

/**
 * @title Deploy
 * @author Aayush Gupta
 * @notice Deploys the Supra adapters and the VaultFactory, then creates the broadcaster's own vault as the demo vault.
 *         Usage: OPERATOR=0x... forge script script/Deploy.s.sol --rpc-url hsk --account owner --broadcast --verify
 *         Writes the deployed addresses into ../ABI/addresses.json.
 */
contract Deploy is Script {
    string constant CONFIG = "../ABI/addresses.json";

    function run() external {
        string memory cfg = vm.readFile(CONFIG);
        address operator = vm.envAddress("OPERATOR");
        ISupraSValueFeed supra = ISupraSValueFeed(vm.parseJsonAddress(cfg, ".supra.storage"));
        string[3] memory syms = ["USDT", "WHSK", "WETH"];
        address[] memory tokens = new address[](3);
        address[] memory feeds = new address[](3);

        vm.startBroadcast();
        for (uint256 i; i < 3; ++i) {
            uint256 pair = vm.parseJsonUint(cfg, string.concat(".supra.pairs.", syms[i]));
            feeds[i] = address(new SupraFeedAdapter(supra, pair, syms[i]));
            tokens[i] = vm.parseJsonAddress(cfg, string.concat(".tokens.", syms[i], ".address"));
        }
        VaultFactory factory = new VaultFactory(
            ISwapRouter02(vm.parseJsonAddress(cfg, ".hskswap.swapRouter02")),
            operator,
            GuardedVault.Policy({
                maxTradeUsd: 10e8, // $10
                dailyLossCapBps: 500, // 5%
                maxOracleDeviationBps: 500, // 5%: oracle lag + 0.3% fee + impact
                cooldownSeconds: 0, // off: the agent spaces its own trades, so trades you ask for in chat are never held back
                maxOracleAge: 93_600 // 26h
            }),
            tokens,
            feeds
        );
        address demo = factory.createVault();
        vm.stopBroadcast();

        vm.writeJson(_q(address(factory)), CONFIG, ".factory");
        vm.writeJson(_q(demo), CONFIG, ".demoVault");
        vm.writeJson(vm.toString(block.number), CONFIG, ".deployBlock");
        for (uint256 i; i < 3; ++i) {
            vm.writeJson(_q(feeds[i]), CONFIG, string.concat(".feeds.", syms[i]));
        }
        console.log("VaultFactory", address(factory));
        console.log("Demo vault", demo);
    }

    function _q(address a) internal pure returns (string memory) {
        return string.concat('"', vm.toString(a), '"');
    }
}
