// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "../../../base/RegistryManagerNonUpgradeable.sol";

/**
  @notice BaseStrategy
  Error cores:
    - BS1 = Not trading phase
    - BS2 = Can't rebalance yet
 */
abstract contract BaseStrategy is RegistryManagerNonUpgradeable {
  /** MODIFIERS */
  /// @notice Restricts access to function to be callable only when Trading Phase is active
  modifier canTrade() {
    require(
      _registryModule
        .getRegistryAddresses()
        .lifecycleModule
        .canTrade(),
        "BS1"
    );
    _;
  }

  /// @notice Restricts access to function to be callable only when Rebalancing is available
  modifier canRebalance() {
    require(
      _registryModule
        .getRegistryAddresses()
        .lifecycleModule
        .canRebalance(),
        "BS2"
    );
    _;
  }

  /** EXTERNAL SETTERS */
  /// @notice Trigger Accounting Module to start rebalancing process only when Rebalancing is possible
  function rebalance() external canRebalance {
    _registryModule
      .getRegistryAddresses()
      .accountingModule
      .rebalance();
  }
}
