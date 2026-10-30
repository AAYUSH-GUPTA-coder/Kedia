// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GuardedVault} from "../src/GuardedVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {SupraFeedAdapter} from "../src/SupraFeedAdapter.sol";
import {ISupraSValueFeed} from "../src/interfaces/ISupraSValueFeed.sol";
import {ISwapRouter02} from "../src/interfaces/ISwapRouter02.sol";
import {TestToken} from "../src/testnet/TestToken.sol";
import {PoolSeeder, IUniswapV3FactoryMin} from "../src/testnet/PoolSeeder.sol";

/**
 * @title DeployTestnet
 * @author Aayush Gupta
 * @notice Deploys the whole Kedia stack on HSK testnet, which has the Supra oracle but no HSKSwap or tokens:
 *         test USDT/WHSK/WETH, the official Uniswap V3 factory, SwapRouter02 and QuoterV2 (HSKSwap is a fork of
 *         them), two seeded pools priced at Supra, the price adapters, the VaultFactory and a funded demo vault.
 *         Usage: AGENT_MASTER_KEY=0x... forge script script/DeployTestnet.s.sol --rpc-url hsk_testnet --account owner \
 *                --broadcast --verify --verifier blockscout --verifier-url https://testnet-explorer.hskchain.net/api/
 *         Writes ../ABI/addresses.testnet.json (or the file named by ADDRESSES).
 */
contract DeployTestnet is Script {
    ISupraSValueFeed constant SUPRA = ISupraSValueFeed(0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917);
    uint24 constant FEE = 3000;

    struct Deployed {
        TestToken usdt;
        TestToken whsk;
        TestToken weth;
        address uniFactory;
        address router;
        address quoter;
        address[] feeds;
        address whskPool;
        address wethPool;
        VaultFactory factory;
        address demo;
    }

    function run() external {
        string memory path = vm.envOr("ADDRESSES", string("../ABI/addresses.testnet.json"));
        string memory base = vm.readFile("../ABI/addresses.json"); // same shape, mainnet values replaced below
        // Same derivation as the backend's agentKey(): one agent wallet per vault creator.
        address agent = vm.addr(uint256(keccak256(abi.encodePacked(vm.envBytes32("AGENT_MASTER_KEY"), msg.sender))));
        uint256 funding = vm.envOr("AGENT_FUNDING", uint256(0.05 ether));
        uint256 depthUsdt = vm.envOr("POOL_DEPTH_USD", uint256(5000)) * 1e6;

        vm.startBroadcast();
        Deployed memory d = deploy(base, agent, funding, depthUsdt, msg.sender);
        vm.stopBroadcast();

        vm.writeFile(path, base);
        _write(path, d);
        console.log("VaultFactory", address(d.factory));
        console.log("Demo vault", d.demo);
        console.log("Demo agent", agent);
    }

    /// @notice The deployment itself, shared with test/TestnetStack.t.sol. `owner` gets the demo vault.
    function deploy(string memory base, address agent, uint256 funding, uint256 depthUsdt, address owner)
        public
        returns (Deployed memory d)
    {
        d.usdt = new TestToken("Kedia Test USDT", "USDT", 6, 100e6);
        d.whsk = new TestToken("Kedia Test WHSK", "WHSK", 18, 1000e18);
        d.weth = new TestToken("Kedia Test WETH", "WETH", 18, 0.05e18);

        d.uniFactory = _deployVendored("UniswapV3Factory", "");
        d.router = _deployVendored("SwapRouter02", abi.encode(address(0), d.uniFactory, address(0), address(d.whsk)));
        d.quoter = _deployVendored("QuoterV2", abi.encode(d.uniFactory, address(d.whsk)));

        string[3] memory syms = ["USDT", "WHSK", "WETH"];
        address[] memory tokens = new address[](3);
        (tokens[0], tokens[1], tokens[2]) = (address(d.usdt), address(d.whsk), address(d.weth));
        d.feeds = new address[](3);
        uint256[3] memory pricesE18;
        for (uint256 i; i < 3; ++i) {
            uint256 pair = vm.parseJsonUint(base, string.concat(".supra.pairs.", syms[i]));
            d.feeds[i] = address(new SupraFeedAdapter(SUPRA, pair, syms[i]));
            ISupraSValueFeed.priceFeed memory f = SUPRA.getSvalue(pair);
            pricesE18[i] = f.price * 10 ** (18 - f.decimals);
        }

        // Pools priced at Supra's HSK_USDT and ETH_USDT pairs, deep enough that a $10 trade moves them well under 1%.
        PoolSeeder seeder = new PoolSeeder(IUniswapV3FactoryMin(d.uniFactory));
        d.usdt.mint(address(seeder), depthUsdt * 3);
        d.whsk.mint(address(seeder), (depthUsdt * 1e12 * 1e18 / pricesE18[1]) * 3);
        d.weth.mint(address(seeder), (depthUsdt * 1e12 * 1e18 / pricesE18[2]) * 3);
        d.whskPool = seeder.seed(address(d.whsk), address(d.usdt), FEE, pricesE18[1], depthUsdt);
        d.wethPool = seeder.seed(address(d.weth), address(d.usdt), FEE, pricesE18[2], depthUsdt);

        d.factory = new VaultFactory(
            ISwapRouter02(d.router),
            GuardedVault.Policy({
                maxTradeUsd: 10e8, // $10
                dailyLossCapBps: 500, // 5%
                maxOracleDeviationBps: 500, // 5%
                cooldownSeconds: 0, // the agent spaces its own trades
                maxOracleAge: 93_600 // 26h: Supra's testnet USDT feed updates every few hours
            }),
            tokens,
            d.feeds
        );
        d.demo = d.factory.createVault{value: funding}(agent);
        GuardedVault demo = GuardedVault(d.demo);
        if (demo.owner() == owner) {
            // Visitors see this vault read-only, so give it something to trade.
            d.usdt.mint(owner, 30e6);
            d.whsk.mint(owner, 300e18);
            IERC20(address(d.usdt)).approve(d.demo, 30e6);
            IERC20(address(d.whsk)).approve(d.demo, 300e18);
            demo.deposit(address(d.usdt), 30e6);
            demo.deposit(address(d.whsk), 300e18);
        }
    }

    function _deployVendored(string memory name, bytes memory args) internal returns (address a) {
        string memory json = vm.readFile(string.concat("vendor/uniswap/", name, ".json"));
        bytes memory code = abi.encodePacked(vm.parseJsonBytes(json, ".bytecode"), args);
        assembly {
            a := create(0, add(code, 0x20), mload(code))
        }
        require(a != address(0), string.concat("deploy failed: ", name));
    }

    function _write(string memory path, Deployed memory d) internal {
        vm.writeJson("133", path, ".chainId");
        vm.writeJson('"https://testnet.hsk.xyz"', path, ".rpcUrl");
        vm.writeJson('"https://testnet-explorer.hskchain.net"', path, ".explorer");
        vm.writeJson('"https://hskchain.net/faucet"', path, ".faucetUrl");
        vm.writeJson(_q(address(d.factory)), path, ".factory");
        vm.writeJson(_q(d.demo), path, ".demoVault");
        vm.writeJson(vm.toString(block.number), path, ".deployBlock");
        vm.writeJson(_q(d.uniFactory), path, ".hskswap.factory");
        vm.writeJson(_q(d.router), path, ".hskswap.swapRouter02");
        vm.writeJson(_q(d.quoter), path, ".hskswap.quoterV2");
        vm.writeJson(_q(address(d.usdt)), path, ".tokens.USDT.address");
        vm.writeJson(_q(address(d.whsk)), path, ".tokens.WHSK.address");
        vm.writeJson(_q(address(d.weth)), path, ".tokens.WETH.address");
        vm.writeJson(_q(d.whskPool), path, ".tokens.WHSK.pool");
        vm.writeJson(_q(d.wethPool), path, ".tokens.WETH.pool");
        vm.writeJson(_q(d.feeds[0]), path, ".feeds.USDT");
        vm.writeJson(_q(d.feeds[1]), path, ".feeds.WHSK");
        vm.writeJson(_q(d.feeds[2]), path, ".feeds.WETH");
        vm.writeJson(_q(address(SUPRA)), path, ".supra.storage");
    }

    function _q(address a) internal pure returns (string memory) {
        return string.concat('"', vm.toString(a), '"');
    }
}
