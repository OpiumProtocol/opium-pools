// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IRegistryModule.sol";

/**
    @notice Non upgradeable abstract contract to allow other modules use Registry Module
    Error codes:
        - RM1 = Incorrect input
 */
abstract contract RegistryManagerNonUpgradeable is ReentrancyGuard, Ownable {
    event RegistryModuleSet(address indexed previousAddress, address indexed newAddress);

    IRegistryAndZodiacModule internal _registryModule;

    /// @notice Constructor
    /// @param registryModule_ address / instance of the Registry Module to setup
    /// @param owner_ address of the RegistryManager's owner
    constructor(IRegistryAndZodiacModule registryModule_, address owner_) {
        // Set registry module instance
        _setRegistryModule(registryModule_);
        // Transfer ownership
        transferOwnership(owner_);
    }

    // External setters
    /// @notice Returns Registry Module instance
    function getRegistryModule() external view returns (IRegistryAndZodiacModule) {
        return _registryModule;
    }

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
        
        address previousAddress = address(_registryModule);
        _registryModule = registryModule_;
        
        emit RegistryModuleSet(previousAddress, address(_registryModule));
    }
}
