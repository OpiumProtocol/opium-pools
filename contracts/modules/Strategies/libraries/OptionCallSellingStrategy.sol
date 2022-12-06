// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "./external/opium-products/ILiveFeedOracleId.sol";

import "./OptionsSellingStrategy.sol";

contract OptionCallSellingStrategy is OptionsSellingStrategy {
  constructor(
    IOpiumRegistry opiumRegistry_,
    IOpiumOnChainPositionsLens opiumLens_,
    address signMessageLib_,
    address auctionHelperContract_,
    address limitOrderProtocol_,
    IRegistryAndZodiacModule registryModule_,
    address owner_,
    address advisor_
  )
    OpiumProtocolV2EnabledStrategy(opiumRegistry_, opiumLens_)
    OpiumAuctionV2EnabledStrategy(signMessageLib_)
    UsingOpiumAuctionV2(auctionHelperContract_, limitOrderProtocol_)
    AdvisableStrategy(owner_, advisor_)
    RegistryManagerNonUpgradeable(registryModule_, owner_)
  {}

  function getNextStrikePrice() public view override returns (uint256 nextStrikePrice) {
    uint256 currentPrice = ILiveFeedOracleId(derivative.oracleId).getResult();
    nextStrikePrice = currentPrice * (BASE + strikePriceDelta) / BASE;

    if (nextStrikePrice > strikePriceRounding) {
      nextStrikePrice = nextStrikePrice - (nextStrikePrice % strikePriceRounding);
    }
  }
}
