// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "./IAccountingModule.sol";
import "./ILifecycleModule.sol";

interface IRegistryModule {
  event RegistryAddressesSet(RegistryAddresses registryAddresses);

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
  function executeOnVault(address target, bytes memory data) external;
}

interface IZodiacModule {
  function avatar() external view returns (address);
}

interface IRegistryAndZodiacModule is IZodiacModule, IRegistryModule {}
