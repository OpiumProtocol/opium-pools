// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "./OpiumV2EnabledStrategy.sol";
import "./AdvisableStrategy.sol";

/**
  @notice BaseStrategy
  Error cores:
    - OSS1 = Invalid value
    - OSS2 = Already minted
 */
abstract contract OptionsSellingStrategy is OpiumV2EnabledStrategy, AdvisableStrategy {
  IOpiumCore.Derivative public derivative;

  uint256 public strikePriceDeltaLimit;

  uint256 public strikePriceDelta;
  uint256 public strikePriceRounding;

  uint256 public strikePrice;

  /** Public Getters */
  function getNextStrikePrice() public virtual returns (uint256);

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

  // Anyone
  function mint() external {
    require(strikePrice == 0, "OSS2");

    strikePrice = getNextStrikePrice();
    derivative.params[0] = strikePrice;
    _opiumV2MintPositions(derivative);
  }

  function execute() external {
    _opiumV2ExecutePositions(derivative);

    strikePrice = 0;
  }

  /** Internal Getters */
  function _getNewStrikePrice() internal virtual returns (uint256);

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
}
