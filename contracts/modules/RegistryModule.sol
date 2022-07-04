// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "../interfaces/IRegistryModule.sol";

/**
    @notice Registry Module keeps track of all the other modules connected to the pool's system

    Inherits Zodiac Module contract to be compatible with Zodiac's ecosystem

    Error codes:
        - R1 = Owner can not be zero address
        - R2 = Avatar can not be zero address
        - R3 = Target can not be zero address
        - R4 = Unauthorized attempt on Vault transactions execution
        - R5 = Vault transaction execution failed
        - R6 = Incorrect input
 */
contract RegistryModule is IRegistryModule, Module {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    /// @notice Holds the address book of the Registry Module
    RegistryAddresses private _registryAddresses;

    /// @notice Initializer of the Registry Module
    /// @param initParams encoded arguments (owner address, avatar address, target address)
    function setUp(bytes memory initParams) public override initializer {
        // Decode arguments
        (
            address _owner,
            address _avatar,
            address _target
        ) = abi.decode(
            initParams,
            (address, address, address)
        );
        // Initialize OwnableUpgradable
        __Ownable_init();
        // Check owner address is not zero address
        require(_owner != address(0), "R1");
        // Check avatar address is not zero address
        require(_avatar != address(0), "R2");
        // Check target address is not zero address
        require(_target != address(0), "R3");
        // Set avatar and target addresses
        avatar = _avatar;
        target = _target;
        // Transfer ownership to the owner
        transferOwnership(_owner);
    }

    // External getters
    /// @notice Returns the address book of the Registry Module
    function getRegistryAddresses() override external view returns (RegistryAddresses memory) {
        return _registryAddresses;
    }

    // External setters
    function setRegistryAddresses(RegistryAddresses memory registryAddresses_) override external onlyOwner {
        _setRegistryAddresses(registryAddresses_);
    }

    /// @notice Executes arbitrary transaction as a call from the Vault's behalf
    /// @param target address of the call target
    /// @param data data of the call
    function executeOnVault(
        address target,
        bytes memory data
    ) override external {
        // Check if msg.sender is authorized to execute transactions on Vault
        require(
            msg.sender == _registryAddresses.stakingModule ||
            msg.sender == address(_registryAddresses.accountingModule) ||
            msg.sender == _registryAddresses.strategyModule,
            "R4"
        );
        // Execute via Zodiac's Module
        bool success = exec(target, 0, data, Enum.Operation.Call);
        // Check if succeeded
        require(success, "R5");
    }

    // Private setters
    /// @dev Private setter of address book of Registry module
    /// @param registryAddresses_ new address book of Registry module
    function _setRegistryAddresses(RegistryAddresses memory registryAddresses_) private {
        // Sanitize inputs and check addresses are non-zero
        require(
            (
                address(registryAddresses_.accountingModule) != address(0) &&
                address(registryAddresses_.lifecycleModule) != address(0) &&
                registryAddresses_.stakingModule != address(0) &&
                registryAddresses_.strategyModule != address(0)
            ),
            "R6"
        );
        // Set new address book
        _registryAddresses = registryAddresses_;
        emit RegistryAddressesSet(_registryAddresses);
    }
}
