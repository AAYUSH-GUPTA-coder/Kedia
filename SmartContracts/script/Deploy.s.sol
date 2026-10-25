// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Script, console} from "forge-std/Script.sol";
import {GuardedVault} from "../src/GuardedVault.sol";
import {SupraFeedAdapter} from "../src/SupraFeedAdapter.sol";
import {ISupraSValueFeed} from "../src/interfaces/ISupraSValueFeed.sol";
import {ISwapRouter02} from "../src/interfaces/ISwapRouter02.sol";

/// @notice Deploys the Supra adapters and the vault, owned by the broadcasting wallet.
/// Usage: OPERATOR=0x... forge script script/Deploy.s.sol --rpc-url hsk --account owner --broadcast --verify
/// Writes the deployed addresses into ../ABI/addresses.json.
contract Deploy is Script {
    string constant CONFIG = "../ABI/addresses.json";

    function run() external {
        string memory cfg = vm.readFile(CONFIG);
        address operator = vm.envAddress("OPERATOR");
        ISupraSValueFeed supra = ISupraSValueFeed(vm.parseJsonAddress(cfg, ".supra.storage"));
        string[3] memory syms = ["USDT", "WHSK", "WETH"];

        vm.startBroadcast();
        GuardedVault vault = new GuardedVault(
            msg.sender,
            operator,
            ISwapRouter02(vm.parseJsonAddress(cfg, ".hskswap.swapRouter02")),
            GuardedVault.Policy({
                maxTradeUsd: 10e8, // $10
                dailyLossCapBps: 500, // 5%
                maxOracleDeviationBps: 500, // 5%: oracle lag + 0.3% fee + impact
                cooldownSeconds: 300,
                maxOracleAge: 93_600 // 26h
            })
        );
        address[3] memory feeds;
        for (uint256 i; i < 3; ++i) {
            uint256 pair = vm.parseJsonUint(cfg, string.concat(".supra.pairs.", syms[i]));
            feeds[i] = address(new SupraFeedAdapter(supra, pair, syms[i]));
            vault.setAllowedToken(vm.parseJsonAddress(cfg, string.concat(".tokens.", syms[i], ".address")), feeds[i]);
        }
        vm.stopBroadcast();

        vm.writeJson(_q(address(vault)), CONFIG, ".vault");
        vm.writeJson(vm.toString(block.number), CONFIG, ".deployBlock");
        for (uint256 i; i < 3; ++i) {
            vm.writeJson(_q(feeds[i]), CONFIG, string.concat(".feeds.", syms[i]));
        }
        console.log("GuardedVault", address(vault));
    }

    function _q(address a) internal pure returns (string memory) {
        return string.concat('"', vm.toString(a), '"');
    }
}
