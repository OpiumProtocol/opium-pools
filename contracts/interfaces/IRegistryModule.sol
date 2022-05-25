// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "./IAccountingModule.sol";
import "./ILifecycleModule.sol";

interface IRegistryModule {
  event RegistryAddressesSet(RegistryAddresses registryAddresses);

  event StrategyEnabled(address indexed strategyAddress);
  event StrategyDisabled(address indexed strategyAddress);

  struct RegistryAddresses {
    IAccountingModule accountingModule;
    ILifecycleModule lifecycleModule;
    address stakingModule;
  }

  // Getters
  function getRegistryAddresses() external view returns (RegistryAddresses memory);
  function getEnabledStrategies() external view returns (address[] memory);
  function isStrategyEnabled(address strategy_) external view returns (bool);

  // Setters
  function setRegistryAddresses(RegistryAddresses memory registryAddresses_) external;
  function enableStrategy(address strategy_) external;
  function disableStrategy(address strategy_) external;
}
