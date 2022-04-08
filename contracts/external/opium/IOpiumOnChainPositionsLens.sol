// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "./IOpiumCore.sol";

interface IOpiumOnChainPositionsLens {
  function predictPositionsAddressesByDerivative(
    IOpiumCore.Derivative calldata _derivative
  ) external view returns (address longPositionAddress, address shortPositionAddress);
}
