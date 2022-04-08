// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "./IAccountingModule.sol";
import "./ILifecycleModule.sol";

interface IRegistryModule {
  struct RegistryAddresses {
    IAccountingModule accountingModule;
    ILifecycleModule lifecycleModule;
    address stakingModule;
  }

  // Setters
  function setRegistryAddresses(RegistryAddresses memory registryAddresses_) external;

  // Getters
  function getRegistryAddresses() external view returns (RegistryAddresses memory);
}
