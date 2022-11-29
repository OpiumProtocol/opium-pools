// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "./external/opium-products/ILiveFeedOracleId.sol";

import "./OptionsSellingStrategy.sol";

abstract contract OptionPutSellingStrategy is OptionsSellingStrategy {
  function getNextStrikePrice() public view override returns (uint256 nextStrikePrice) {
    uint256 currentPrice = ILiveFeedOracleId(derivative.oracleId).getResult();
    nextStrikePrice = currentPrice * (BASE - strikePriceDelta) / BASE;

    if (nextStrikePrice > strikePriceRounding) {
      nextStrikePrice = nextStrikePrice - (nextStrikePrice % strikePriceRounding);
    }
  }
}
