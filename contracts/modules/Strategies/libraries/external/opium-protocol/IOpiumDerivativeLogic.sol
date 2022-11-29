// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "./IOpiumCore.sol";

interface IOpiumDerivativeLogic {
  function getMargin(IOpiumCore.Derivative memory _derivative)
      external
      view
      returns (uint256 buyerMargin, uint256 sellerMargin);
}
