// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IOpiumCore {
  // Opium derivative structure (ticker) definition
  struct Derivative {
    // Margin parameter for syntheticId
    uint256 margin;
    // Maturity of derivative
    uint256 endTime;
    // Additional parameters for syntheticId
    uint256[] params;
    // oracleId of derivative
    address oracleId;
    // Margin token address of derivative
    address token;
    // syntheticId of derivative
    address syntheticId;
  }
  
  function redeem(address[2] calldata _positionsAddresses, uint256 _amount) external;
  function execute(address _positionAddress, uint256 _amount) external;

  function createAndMint(
    Derivative calldata _derivative,
    uint256 _amount,
    address[2] calldata _positionsOwners
  ) external;
}
