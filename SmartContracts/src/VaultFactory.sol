// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {GuardedVault} from "./GuardedVault.sol";
import {ISwapRouter02} from "./interfaces/ISwapRouter02.sol";

/**
 * @title VaultFactory
 * @author Aayush Gupta
 * @notice Lets any wallet create its own GuardedVault, one per wallet. The new vault is owned by the
 *         caller and operated by the platform's agent key, which pays the gas for trades but, like any
 *         operator, can only swap inside the owner's limits and can never withdraw.
 */
contract VaultFactory is Ownable {
    ISwapRouter02 public immutable router;
    /// @notice Agent key set as operator on new vaults. Existing vaults keep theirs; their owners can change it.
    address public operator;
    GuardedVault.Policy internal _policy;
    address[] internal _tokens;
    address[] internal _feeds;

    /// @notice owner wallet => its vault, address(0) if it has none.
    mapping(address => address) public vaultOf;
    address[] internal _vaults;

    event VaultCreated(address indexed owner, address vault);
    event OperatorSet(address indexed operator);

    error VaultExists(address vault);
    error LengthMismatch();

    constructor(
        ISwapRouter02 router_,
        address operator_,
        GuardedVault.Policy memory policy_,
        address[] memory tokens_,
        address[] memory feeds_
    ) Ownable(msg.sender) {
        if (tokens_.length != feeds_.length) revert LengthMismatch();
        router = router_;
        operator = operator_;
        _policy = policy_;
        _tokens = tokens_;
        _feeds = feeds_;
        emit OperatorSet(operator_);
    }

    /// @notice Deploys a vault owned by the caller with the default policy and token list.
    function createVault() external returns (address vault) {
        if (vaultOf[msg.sender] != address(0)) revert VaultExists(vaultOf[msg.sender]);
        GuardedVault v = new GuardedVault(address(this), operator, router, _policy);
        vault = address(v);
        vaultOf[msg.sender] = vault;
        _vaults.push(vault);
        for (uint256 i; i < _tokens.length; ++i) {
            v.setAllowedToken(_tokens[i], _feeds[i]);
        }
        v.transferOwnership(msg.sender);
        emit VaultCreated(msg.sender, vault);
    }

    function setOperator(address operator_) external onlyOwner {
        operator = operator_;
        emit OperatorSet(operator_);
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
