// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IOpiumRegistry {
  struct ProtocolAddressesArgs {
    // Address of Opium.Core contract
    address core;
    // Address of Opium.OpiumProxyFactory contract
    address opiumProxyFactory;
    // Address of Opium.OracleAggregator contract
    address oracleAggregator;
    // Address of Opium.SyntheticAggregator contract
    address syntheticAggregator;
    // Address of Opium.TokenSpender contract
    address tokenSpender;
    // Address of the recipient of execution protocol reserves
    address protocolExecutionReserveClaimer;
    // Address of the recipient of redemption protocol reserves
    address protocolRedemptionReserveClaimer;
    /// Initially uninitialized variables to allow some flexibility in case of future changes and upgradeability
    uint32 __gapOne;
    uint32 __gapTwo;
  }

  function getProtocolAddresses() external view returns (ProtocolAddressesArgs memory);
}
