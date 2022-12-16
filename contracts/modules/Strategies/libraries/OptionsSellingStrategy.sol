// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "./OpiumProtocolV2EnabledStrategy.sol";
import "./OpiumAuctionV2EnabledStrategy.sol";
import "./AdvisableStrategy.sol";

abstract contract OptionsSellingStrategy is OpiumProtocolV2EnabledStrategy, OpiumAuctionV2EnabledStrategy, AdvisableStrategy {
  IOpiumCore.Derivative public derivative;

  // Configurable
  uint256 public strikePriceDeltaLimit = 0.1e18;

  uint256 public strikePriceDelta = 0.1e18;
  uint256 public strikePriceRounding = 100e18;

  uint256 public auctionDuration = 40 minutes;
  uint256 public auctionMinPrice = 0.0005e18;
  uint256 public auctionMaxPrice = 0.0020e18;
  uint256 public auctionAmplifier = 10;

  // Non-configurable
  uint256 public strikePrice;
  address public longPositionAddress;
  uint256 public availableQuantity;

  /** Public Getters */
  function getNextStrikePrice() public view virtual returns (uint256);

  function getDerivative() public view returns (IOpiumCore.Derivative memory) {
    return derivative;
  }

  function getAuctionMinPrice() public view returns (uint256) {
    return auctionMinPrice;
  }

  function getAuctionMaxPrice() public view returns (uint256) {
    return auctionMaxPrice;
  }

  /** Public Setters */
  // Owner
  function setDerivative(IOpiumCore.Derivative memory derivative_) external onlyOwner {
    _setDerivative(derivative_);
  }

  function setStrikePriceDeltaLimit(uint256 strikePriceDeltaLimit_) external onlyOwner {
    _setStrikePriceDeltaLimit(strikePriceDeltaLimit_);
  }

  // Advisor
  function setStrikePriceDelta(uint256 strikePriceDelta_) external onlyRole(ADVISOR_ROLE) {
    _setStrikePriceDelta(strikePriceDelta_);
  }

  function setStrikePriceRounding(uint256 strikePriceRounding_) external onlyRole(ADVISOR_ROLE) {
    _setStrikePriceRounding(strikePriceRounding_);
  }

  function cancelAuction(AuctionOrder memory auctionOrder_) external onlyRole(ADVISOR_ROLE) {
    _cancelAuction(auctionOrder_);
  }

  function setAuctionDuration(uint256 auctionDuration_) external onlyRole(ADVISOR_ROLE) {
    _setAuctionDuration(auctionDuration_);
  }

  function setAuctionPrices(uint256 auctionMinPrice_, uint256 auctionMaxPrice_) external onlyRole(ADVISOR_ROLE) {
    _setAuctionPrices(auctionMinPrice_, auctionMaxPrice_);
  }

  function setAuctionAmplifier(uint256 auctionAmplifier_) external onlyRole(ADVISOR_ROLE) {
    _setAuctionAmplifier(auctionAmplifier_);
  }

  // Anyone
  function mint() external canTrade() {
    require(strikePrice == 0, "OSS2");

    ILifecycleModule lifecycleModule = _registryModule.getRegistryAddresses().lifecycleModule;

    strikePrice = getNextStrikePrice();
    derivative.endTime = lifecycleModule.getCurrentEpochEnd();
    derivative.params[0] = strikePrice;
    (
      longPositionAddress,
      ,
      availableQuantity
    ) = _opiumV2MintPositions(derivative);
  }

  function startAuction() external canTrade() {
    require(strikePrice != 0, "OSS3");

    ILifecycleModule lifecycleModule = _registryModule.getRegistryAddresses().lifecycleModule;

    uint256[] memory pricingFunctionParams = new uint256[](1);
    pricingFunctionParams[0] = auctionAmplifier;

    AuctionOrder memory auctionOrder = AuctionOrder(
      IERC20(longPositionAddress), // selling token
      IERC20(derivative.token), // purchasing token
      availableQuantity, // selling amount
      PricingFunction.EXPONENTIAL, // pricing function
      pricingFunctionParams, // pricing function params
      PricingDirection.DECREASING, // pricing function direction
      true, // partial fill
      availableQuantity * getAuctionMinPrice() / BASE, // min purchasing amount
      availableQuantity * getAuctionMaxPrice() / BASE, // max purchasing amount
      block.timestamp, // started at
      block.timestamp + auctionDuration, // ended at
      lifecycleModule.getEpochId() // salt
    );

    _startAuction(auctionOrder);
  }

  function execute() external canRebalance() {
    _opiumV2ExecutePositions(derivative);

    strikePrice = 0;
  }

  /** Internal Setters */
  function _setDerivative(IOpiumCore.Derivative memory derivative_) internal {
    derivative = derivative_;
  }

  function _setStrikePriceDeltaLimit(uint256 strikePriceDeltaLimit_) internal {
    strikePriceDeltaLimit = strikePriceDeltaLimit_;
  }

  function _setStrikePriceDelta(uint256 strikePriceDelta_) internal {
    require(strikePriceDelta_ >= strikePriceDeltaLimit, "OSS1");
    strikePriceDelta = strikePriceDelta_;
  }

  function _setStrikePriceRounding(uint256 strikePriceRounding_) internal {
    require(strikePriceRounding_ > 0, "OSS1");
    strikePriceRounding = strikePriceRounding_;
  }

  function _setAuctionDuration(uint256 auctionDuration_) internal {
    auctionDuration = auctionDuration_;
  }

  function _setAuctionPrices(uint256 auctionMinPrice_, uint256 auctionMaxPrice_) internal {
    auctionMinPrice = auctionMinPrice_;
    auctionMaxPrice = auctionMaxPrice_;
  }

  function _setAuctionAmplifier(uint256 auctionAmplifier_) internal {
    auctionAmplifier = auctionAmplifier_;
  }
}
