// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../external/opium/IOpiumRegistry.sol";
import "../../external/opium/IOpiumCore.sol";
import "../../external/opium/IOpiumDerivativeLogic.sol";
import "../../external/opium/LibOpiumCalculator.sol";
import "../../external/opium/IOpiumOnChainPositionsLens.sol";

import "../../base/RegistryManager.sol";
import "../../base/SafeModule.sol";

import "../../interfaces/IStrategyModule.sol";

contract OptionsSellingStrategyModule is IStrategyModule, RegistryManager, AccessControl {
  using LibOpiumCalculator for uint256;
  using SafeERC20 for IERC20Metadata;

  bytes32 public constant ADVISOR_ROLE = keccak256("ADVISOR_ROLE");

  IOpiumRegistry private _opiumRegistry;
  IOpiumOnChainPositionsLens private _opiumLens;

  mapping (address => uint256) _premiums;

  constructor(
    IOpiumRegistry opiumRegistry_,
    IOpiumOnChainPositionsLens opiumLens_,
    IRegistryModule registryModule_,
    Executor executor_
  )
    RegistryManager(registryModule_)
    SafeModule(executor_)
  {
    _setupRole(DEFAULT_ADMIN_ROLE, address(executor_));

    _setOptionRegistry(opiumRegistry_);
    _setOpiumLens(opiumLens_);
  }

  modifier canTrade() {
    require(
      getRegistryModule()
        .getRegistryAddresses()
        .lifecycleModule
        .canTrade(),
        "can't trade"
    );
    _;
  }

  modifier canRebalance() {
    require(
      getRegistryModule()
        .getRegistryAddresses()
        .lifecycleModule
        .canRebalance(),
        "can't trade"
    );
    _;
  }

  // Public getters
  function getAvailableQuantity(IOpiumCore.Derivative memory derivative_) public view returns (uint256 availableQuantity, uint256 requiredMargin) {
    // Get available liquidity
    uint256 availableLiquidity = getRegistryModule().getRegistryAddresses().accountingModule.getAvailableLiquidity();
    // Get required margin per contract
    uint256[2] memory margins;
    (margins[0], margins[1]) = IOpiumDerivativeLogic(derivative_.syntheticId).getMargin(derivative_);
    uint256 totalMargin = margins[0] + margins[1];

    availableQuantity = availableLiquidity / totalMargin;
    requiredMargin = availableQuantity * totalMargin;
  }

  // External setters
  function mintPositions(IOpiumCore.Derivative memory derivative_) external canTrade onlyRole(ADVISOR_ROLE) {
    (uint256 availableQuantity, uint256 requiredMargin) = getAvailableQuantity(derivative_);

    // Approve margin to TokenSpender to create positions
    bytes memory data = abi.encodeWithSelector(
      bytes4(keccak256(bytes("approve(address,uint256)"))),
      _opiumRegistry.getProtocolAddresses().tokenSpender,
      requiredMargin
    );
    _executeCall(derivative_.token, data);

    IOpiumCore(_opiumRegistry.getProtocolAddresses().core).createAndMint(
      derivative_,
      availableQuantity * 1e18,
      [address(this),address(this)]
    );

    (address longPositionAddress, address shortPositionAddress) = _opiumLens.predictPositionsAddressesByDerivative(derivative_);

    IAccountingModule accountingModule = getRegistryModule().getRegistryAddresses().accountingModule;

    accountingModule.changeHoldingPosition(longPositionAddress, true);
    accountingModule.changeHoldingPosition(shortPositionAddress, true);
  }

  function setPremium(address position_, uint256 premium_) external onlyRole(ADVISOR_ROLE) {
    _setPremium(position_, premium_);
  }

  function purchasePosition(address position_, uint256 quantity_, uint256 maxPremium_) external canTrade {
    IAccountingModule accountingModule = getRegistryModule().getRegistryAddresses().accountingModule;

    require(
      _premiums[position_] != 0 &&
      _premiums[position_] <= maxPremium_,
      "purchase conditions not met"
    );

    // Transfer premium in
    accountingModule.getUnderlying().safeTransferFrom(msg.sender, address(_executor), quantity_ * _premiums[position_]);
    // Transfer positions out
    bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), msg.sender, quantity_ * 1e18);
    _executeCall(position_, data);
  }

  function executePositions(IOpiumCore.Derivative memory derivative_) external canRebalance {
    (address longPositionAddress, address shortPositionAddress) = _opiumLens.predictPositionsAddressesByDerivative(derivative_);
    uint256 longPositionBalance = IERC20Metadata(longPositionAddress).balanceOf(address(_executor));
    uint256 shortPositionBalance = IERC20Metadata(shortPositionAddress).balanceOf(address(_executor));

    // Check if positions redemption is possible
    if (longPositionBalance != 0 && shortPositionBalance != 0) {
      // Calculate minimum positions for redemption
      uint256 redeemPositions = longPositionBalance > shortPositionBalance ? shortPositionBalance : longPositionBalance;

      // Redeem positions
      bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("redeem(address[],uint256)"))), [longPositionAddress,shortPositionAddress], redeemPositions);
      _executeCall(_opiumRegistry.getProtocolAddresses().core, data);

      longPositionBalance -= redeemPositions;
      shortPositionBalance -= redeemPositions;
    }

    if (longPositionBalance > 0) {
      bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("execute(address,uint256)"))), longPositionAddress, longPositionBalance);
      _executeCall(_opiumRegistry.getProtocolAddresses().core, data);
    }

    if (shortPositionBalance > 0) {
      bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("execute(address,uint256)"))), shortPositionAddress, shortPositionBalance);
      _executeCall(_opiumRegistry.getProtocolAddresses().core, data);
    }

    IAccountingModule accountingModule = getRegistryModule().getRegistryAddresses().accountingModule;
    accountingModule.changeHoldingPosition(longPositionAddress, false);
    accountingModule.changeHoldingPosition(shortPositionAddress, false);
  }

  function rebalance() external canRebalance {
    
  }

  // Private setters
  function _setOptionRegistry(IOpiumRegistry opiumRegistry_) private {
    _opiumRegistry = opiumRegistry_;
  }

  function _setOpiumLens(IOpiumOnChainPositionsLens opiumLens_) private {
    _opiumLens = opiumLens_;
  }

  function _setPremium(address position_, uint256 premium_) private {
    _premiums[position_] = premium_;
  }
}
