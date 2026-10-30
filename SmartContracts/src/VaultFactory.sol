// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {GuardedVault} from "./GuardedVault.sol";
import {ISwapRouter02} from "./interfaces/ISwapRouter02.sol";

/**
 * @title VaultFactory
 * @author Aayush Gupta
 * @notice Lets any wallet create its own GuardedVault, one per wallet. The new vault is owned by the
 *         caller and operated by its own agent wallet, which the caller funds with HSK for gas in the
 *         same transaction. Like any operator, the agent can only swap inside the owner's limits and
 *         can never withdraw.
 */
contract VaultFactory {
    ISwapRouter02 public immutable router;
    GuardedVault.Policy internal _policy;
    address[] internal _tokens;
    address[] internal _feeds;

    /// @notice owner wallet => its vault, address(0) if it has none.
    mapping(address => address) public vaultOf;
    /// @notice vault => the wallet that created it. The backend derives each vault's agent key from it.
    mapping(address => address) public creatorOf;
    address[] internal _vaults;

    event VaultCreated(address indexed owner, address vault, address agent, uint256 agentFunding);

    error VaultExists(address vault);
    error LengthMismatch();
    error ZeroAgent();
    error AgentFundingFailed();

    constructor(
        ISwapRouter02 router_,
        GuardedVault.Policy memory policy_,
        address[] memory tokens_,
        address[] memory feeds_
    ) {
        if (tokens_.length != feeds_.length) revert LengthMismatch();
        router = router_;
        _policy = policy_;
        _tokens = tokens_;
        _feeds = feeds_;
    }

    /**
     * @notice Deploys a vault owned by the caller with the default policy and token list, operated by
     *         `agent`. Any HSK sent along goes to the agent to pay for its trades.
     */
    function createVault(address agent) external payable returns (address vault) {
        if (vaultOf[msg.sender] != address(0)) revert VaultExists(vaultOf[msg.sender]);
        if (agent == address(0)) revert ZeroAgent();
        GuardedVault v = new GuardedVault(address(this), agent, router, _policy);
        vault = address(v);
        vaultOf[msg.sender] = vault;
        creatorOf[vault] = msg.sender;
        _vaults.push(vault);
        for (uint256 i; i < _tokens.length; ++i) {
            v.setAllowedToken(_tokens[i], _feeds[i]);
        }
        v.transferOwnership(msg.sender);
        emit VaultCreated(msg.sender, vault, agent, msg.value);
        if (msg.value > 0) {
            (bool ok,) = agent.call{value: msg.value}("");
            if (!ok) revert AgentFundingFailed();
        }
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    function allVaults() external view returns (address[] memory) {
        return _vaults;
    }

    function vaultCount() external view returns (uint256) {
        return _vaults.length;
    }

    function defaultPolicy() external view returns (GuardedVault.Policy memory) {
        return _policy;
    }
}
