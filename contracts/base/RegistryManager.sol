// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/IRegistryModule.sol";

/**
    @notice Abstract contract to allow modules use Registry Module
    Error codes:
        - RM1 = Incorrect input
 */
abstract contract RegistryManager is ReentrancyGuardUpgradeable, OwnableUpgradeable {
    IRegistryAndZodiacModule internal _registryModule;
    
    function __RegistryManager_init(IRegistryAndZodiacModule registryModule_, address owner_) internal onlyInitializing {
        __ReentrancyGuard_init();
        __Ownable_init();
        __RegistryManager_init_unchained(registryModule_, owner_);
    }

    function __RegistryManager_init_unchained(IRegistryAndZodiacModule registryModule_, address owner_) internal onlyInitializing {
        _setRegistryModule(registryModule_);

        transferOwnership(owner_);
    }

    // Public getters
    function getRegistryModule() public view returns (IRegistryAndZodiacModule) {
        return _registryModule;
    }

    // External setters
    function setRegistryModule(IRegistryAndZodiacModule registryModule_) external onlyOwner {
        _setRegistryModule(registryModule_);
    }

    // Private setters
    function _setRegistryModule(IRegistryAndZodiacModule registryModule_) private nonReentrant {
        require(address(registryModule_) != address(0), "RM1");
        _registryModule = registryModule_;
    }
}
