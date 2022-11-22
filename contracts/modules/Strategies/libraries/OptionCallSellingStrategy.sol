// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "./OptionsSellingStrategy.sol";

/**
  @notice BaseStrategy
  Error cores:
    - OSS1 = Invalid value
    - OSS2 = Already minted
 */
abstract contract OptionCallSellingStrategy is OptionsSellingStrategy {
  // TODO: Implement: Call / Put selling strategy + Auction selling strategy + Combo

  function getNextStrikePrice() public override returns (uint256) {
    
  }
}
