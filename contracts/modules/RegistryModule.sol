// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "../interfaces/IRegistryModule.sol";

/**
    @notice Registry Module keeps track of all the other modules connected to the pool's system

    Error codes:
        - R1 = Avatar can not be zero address
        - R2 = Target can not be zero address
        - R3 = Unauthorized attempt on Vault transactions execution
        - R4 = Vault transaction execution failed
        - R5 = Incorrect input
 */
contract RegistryModule is IRegistryModule, Module {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    RegistryAddresses private _registryAddresses;

    function setUp(bytes memory initParams) public override initializer {
        (
            address _owner,
            address _avatar,
            address _target
        ) = abi.decode(
            initParams,
            (address, address, address)
        );
        __Ownable_init();
        require(_avatar != address(0), "R1");
        require(_target != address(0), "R2");
        avatar = _avatar;
        target = _target;

        transferOwnership(_owner);
    }

    // External getters
    function getRegistryAddresses() override external view returns (RegistryAddresses memory) {
        return _registryAddresses;
    }

    // External setters
    function setRegistryAddresses(RegistryAddresses memory registryAddresses_) override external onlyOwner {
        _setRegistryAddresses(registryAddresses_);
    }

    function executeOnVault(
        address target,
        bytes memory data
    ) override external {
        // Check if msg.sender is authorized to execute transactions on Vault
        require(
            msg.sender == _registryAddresses.stakingModule ||
            msg.sender == address(_registryAddresses.accountingModule) ||
            msg.sender == _registryAddresses.strategyModule,
            "R3"
        );
        bool success = exec(target, 0, data, Enum.Operation.Call);
        require(success, "R4");
    }

    // Private setters
    function _setRegistryAddresses(RegistryAddresses memory registryAddresses_) private {
        require(
            (
                address(registryAddresses_.accountingModule) != address(0) &&
                address(registryAddresses_.lifecycleModule) != address(0) &&
                registryAddresses_.stakingModule != address(0) &&
                registryAddresses_.strategyModule != address(0)
            ),
            "R5"
        );
        _registryAddresses = registryAddresses_;
        emit RegistryAddressesSet(_registryAddresses);
    }
}
