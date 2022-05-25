// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Enum {
    enum Operation {
        Call, DelegateCall
    }
}

interface Executor {
    /// @dev Allows a Module to execute a transaction.
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
    function execTransactionFromModule(address to, uint256 value, bytes calldata data, Enum.Operation operation)
        external
        returns (bool success);
}

/**
    @notice Abstract contract to allow modules send transactions on GnosisSafe's behalf
    Error codes:
        - SM1 = Only executor allowed
        - SM2 = Wrong input
        - SM3 = SafeModule execution failed
 */
contract SafeModule is ReentrancyGuard {
    Executor internal _executor;

    modifier onlyExecutor() {
        require(msg.sender == address(_executor), "SM1");
        _;
    }
    
    constructor(Executor executor_) {
        _setExecutor(executor_);
    }

    // External getters
    function getExecutor() external view returns (Executor) {
        return _executor;
    }

    // External setters
    function setExecutor(Executor executor_) external onlyExecutor {
        _setExecutor(executor_);
    }

    // Internal setters
    function _executeCall(address target_, bytes memory data_) internal {
        bool success = _executor.execTransactionFromModule(
            target_,
            0,
            data_,
            Enum.Operation.Call
        );
        require(success, "SM3");
    }

    // Private setters
    function _setExecutor(Executor executor_) private nonReentrant {
        require(address(executor_) != address(0), "SM2");
        _executor = executor_;
    }
}
