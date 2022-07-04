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
    address strategyModule;
  }

  // Getters
  function getRegistryAddresses() external view returns (RegistryAddresses memory);

  // Setters
  function setRegistryAddresses(RegistryAddresses memory registryAddresses_) external;
}
