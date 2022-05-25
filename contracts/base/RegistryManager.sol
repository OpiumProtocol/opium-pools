// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "../interfaces/IRegistryModule.sol";

import "./SafeModule.sol";

/**
    @notice Abstract contract to allow modules use Registry Module
    Error codes:
        - RM1 = Incorrect input
 */
abstract contract RegistryManager is SafeModule {
    IRegistryModule internal _registryModule;
    
    constructor(IRegistryModule registryModule_) {
        _setRegistryModule(registryModule_);
    }

    // Public getters
    function getRegistryModule() public view returns (IRegistryModule) {
        return _registryModule;
    }

    // External setters
    function setRegistryModule(IRegistryModule registryModule_) external onlyExecutor {
        _setRegistryModule(registryModule_);
    }

    // Private setters
    function _setRegistryModule(IRegistryModule registryModule_) private nonReentrant {
        require(address(registryModule_) != address(0), "RM1");
        _registryModule = registryModule_;
    }
}
