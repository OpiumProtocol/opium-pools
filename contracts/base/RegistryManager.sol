// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/IRegistryModule.sol";

/**
    @notice Abstract contract to allow other modules use Registry Module
    Error codes:
        - RM1 = Incorrect input
 */
abstract contract RegistryManager is ReentrancyGuardUpgradeable, OwnableUpgradeable {
    IRegistryAndZodiacModule internal _registryModule;
    
    /// @notice Chained initializer
    /// @param registryModule_ address / instance of the Registry Module to setup
    /// @param owner_ address of the RegistryManager's owner
    function __RegistryManager_init(IRegistryAndZodiacModule registryModule_, address owner_) internal onlyInitializing {
        // Initialize ReentrancyGuardUpgradable
        __ReentrancyGuard_init();
        // Initialize OwnableUpgradable
        __Ownable_init();
        // Initialize RegistryManager
        __RegistryManager_init_unchained(registryModule_, owner_);
    }

    /// @notice Unchained initializer
    /// @param registryModule_ address / instance of the Registry Module to setup
    /// @param owner_ address of the RegistryManager's owner
    function __RegistryManager_init_unchained(IRegistryAndZodiacModule registryModule_, address owner_) internal onlyInitializing {
        // Set registry module instance
        _setRegistryModule(registryModule_);
        // Transfer ownership
        transferOwnership(owner_);
    }

    // Public getters

    /// @notice Returns Registry Module instance
    function getRegistryModule() public view returns (IRegistryAndZodiacModule) {
        return _registryModule;
    }

    // External setters
    /// @notice Changes Registry Module instance
    /// @param registryModule_ new address / instance of the Registry Module
    function setRegistryModule(IRegistryAndZodiacModule registryModule_) external onlyOwner {
        _setRegistryModule(registryModule_);
    }

    // Private setters
    /// @dev Private Registry Manager instance setter with input sanitizing
    /// @param registryModule_ address / instance of the Registry Module to set
    function _setRegistryModule(IRegistryAndZodiacModule registryModule_) private nonReentrant {
        // Check if not a zero address
        require(address(registryModule_) != address(0), "RM1");
        _registryModule = registryModule_;
    }
}
