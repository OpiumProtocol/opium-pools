// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "../base/SafeModule.sol";

import "../interfaces/IRegistryModule.sol";

/**
    @notice Registry Module keeps track of all the other modules connected to the pool's system

    Error codes:
        - R1 = Incorrect input
 */
contract RegistryModule is IRegistryModule, SafeModule {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    RegistryAddresses private _registryAddresses;

    EnumerableSetUpgradeable.AddressSet private _strategies;

    function initialize(Executor executor_) external initializer {
        __SafeModule_init(executor_);
    }

    // External getters
    function getRegistryAddresses() override external view returns (RegistryAddresses memory) {
        return _registryAddresses;
    }

    function getEnabledStrategies() override external view returns (address[] memory) {
        return _strategies.values();
    }

    function isStrategyEnabled(address strategy_) override external view returns (bool) {
        return _strategies.contains(strategy_);
    }

    // External setters
    function setRegistryAddresses(RegistryAddresses memory registryAddresses_) override external onlyExecutor {
        _setRegistryAddresses(registryAddresses_);
    }

    function enableStrategy(address strategy_) override external onlyExecutor {
        _strategies.add(strategy_);
        emit StrategyEnabled(strategy_);
    }

    function disableStrategy(address strategy_) override external onlyExecutor {
        _strategies.remove(strategy_);
        emit StrategyDisabled(strategy_);
    }

    // Private setters
    function _setRegistryAddresses(RegistryAddresses memory registryAddresses_) private {
        require(
            (
                address(registryAddresses_.accountingModule) != address(0) &&
                address(registryAddresses_.lifecycleModule) != address(0) &&
                registryAddresses_.stakingModule != address(0)
            ),
            "R1"
        );
        _registryAddresses = registryAddresses_;
        emit RegistryAddressesSet(_registryAddresses);
    }
}
