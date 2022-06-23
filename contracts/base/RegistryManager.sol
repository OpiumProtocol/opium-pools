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
    
    function __RegistryManager_init(IRegistryModule registryModule_, Executor executor_) internal onlyInitializing {
        __SafeModule_init(executor_);
        __RegistryManager_init_unchained(registryModule_);
    }

    function __RegistryManager_init_unchained(IRegistryModule registryModule_) internal onlyInitializing {
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
