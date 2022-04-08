// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../base/SafeModule.sol";

import "../interfaces/IRegistryModule.sol";

contract RegistryModule is IRegistryModule, ReentrancyGuard, SafeModule {
    RegistryAddresses private _registryAddresses;

    constructor(Executor executor_) SafeModule(executor_) {}

    // External getters
    function getRegistryAddresses() override external view returns (RegistryAddresses memory) {
        return _registryAddresses;
    }

    // External setters
    function setRegistryAddresses(RegistryAddresses memory registryAddresses_) override external onlyExecutor nonReentrant {
        _setRegistryAddresses(registryAddresses_);
    }

    // Private setters
    function _setRegistryAddresses(RegistryAddresses memory registryAddresses_) private {
        // TODO: Sanitize
        _registryAddresses = registryAddresses_;
    }
}
