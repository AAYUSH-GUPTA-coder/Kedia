// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TestToken
 * @author Aayush Gupta
 * @notice Stand-in for USDT, WHSK and WETH on HSK testnet, where they do not exist. The deployer mints
 *         pool liquidity; anyone can claim a small amount from the faucet once an hour to try Kedia.
 */
contract TestToken is ERC20, Ownable {
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    uint8 internal immutable _decimals;
    /// @notice Tokens one faucet claim gives.
    uint256 public immutable faucetAmount;
    mapping(address => uint256) public lastClaimAt;

    error FaucetCooldown(uint256 nextClaimAt);

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 faucetAmount_)
        ERC20(name_, symbol_)
        Ownable(msg.sender)
    {
        _decimals = decimals_;
        faucetAmount = faucetAmount_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function faucet() external {
        uint256 next = lastClaimAt[msg.sender] + FAUCET_COOLDOWN;
        if (lastClaimAt[msg.sender] != 0 && block.timestamp < next) revert FaucetCooldown(next);
        lastClaimAt[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
    }
}
