// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../../external/opium/IOpiumRegistry.sol";
import "../../external/opium/IOpiumCore.sol";
import "../../external/opium/IOpiumDerivativeLogic.sol";
import "../../external/opium/LibOpiumCalculator.sol";
import "../../external/opium/IOpiumOnChainPositionsLens.sol";

import "../../base/RegistryManager.sol";

import "../../interfaces/IStrategyModule.sol";

contract OptionsSellingStrategyModule is IStrategyModule, RegistryManager, AccessControlUpgradeable {
  using LibOpiumCalculator for uint256;
  using SafeERC20Upgradeable for IERC20MetadataUpgradeable;

  bytes32 public constant ADVISOR_ROLE = keccak256("ADVISOR_ROLE");
  
  uint256 public constant BASE = 1e18;

  IOpiumRegistry private _opiumRegistry;
  IOpiumOnChainPositionsLens private _opiumLens;

  mapping (address => uint256) _premiums;

  function initialize(
    IOpiumRegistry opiumRegistry_,
    IOpiumOnChainPositionsLens opiumLens_,
    IRegistryAndZodiacModule registryModule_,
    address owner_
  )
    external initializer
  {
    __RegistryManager_init(registryModule_, owner_);

    _setupRole(DEFAULT_ADMIN_ROLE, address(owner_));

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

    availableQuantity = availableLiquidity * BASE / totalMargin;
    requiredMargin = availableQuantity * totalMargin / BASE;
  }

  // External setters
  function mintPositions(IOpiumCore.Derivative memory derivative_) external canTrade onlyRole(ADVISOR_ROLE) {
    ILifecycleModule lifecycleModule = getRegistryModule().getRegistryAddresses().lifecycleModule;
    require(lifecycleModule.getCurrentEpochEnd() >= derivative_.endTime, "no no no");

    (uint256 availableQuantity, uint256 requiredMargin) = getAvailableQuantity(derivative_);

    // Approve margin to TokenSpender to create positions
    bytes memory data = abi.encodeWithSelector(
      bytes4(keccak256(bytes("approve(address,uint256)"))),
      _opiumRegistry.getProtocolAddresses().tokenSpender,
      requiredMargin
    );
    getRegistryModule().executeOnVault(derivative_.token, data);

    data = abi.encodeWithSelector(
      bytes4(keccak256(bytes("createAndMint((uint256,uint256,uint256[],address,address,address),uint256,address[2])"))),
      derivative_,
      availableQuantity,
      [getRegistryModule().avatar(),getRegistryModule().avatar()]
    );
    getRegistryModule().executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);

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
    accountingModule.getUnderlying().safeTransferFrom(msg.sender, getRegistryModule().avatar(), quantity_ * _premiums[position_] / BASE);
    // Transfer positions out
    bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), msg.sender, quantity_);
    getRegistryModule().executeOnVault(position_, data);
  }

  function executePositions(IOpiumCore.Derivative memory derivative_) external canRebalance {
    (address longPositionAddress, address shortPositionAddress) = _opiumLens.predictPositionsAddressesByDerivative(derivative_);
    uint256 longPositionBalance = IERC20MetadataUpgradeable(longPositionAddress).balanceOf(getRegistryModule().avatar());
    uint256 shortPositionBalance = IERC20MetadataUpgradeable(shortPositionAddress).balanceOf(getRegistryModule().avatar());

    // Check if positions redemption is possible
    if (longPositionBalance != 0 && shortPositionBalance != 0) {
      // Calculate minimum positions for redemption
      uint256 redeemPositions = longPositionBalance > shortPositionBalance ? shortPositionBalance : longPositionBalance;

      // Redeem positions
      bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("redeem(address[],uint256)"))), [longPositionAddress,shortPositionAddress], redeemPositions);
      getRegistryModule().executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);

      longPositionBalance -= redeemPositions;
      shortPositionBalance -= redeemPositions;
    }

    if (longPositionBalance > 0) {
      bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("execute(address,uint256)"))), longPositionAddress, longPositionBalance);
      getRegistryModule().executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);
    }

    if (shortPositionBalance > 0) {
      bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("execute(address,uint256)"))), shortPositionAddress, shortPositionBalance);
      getRegistryModule().executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);
    }

    IAccountingModule accountingModule = getRegistryModule().getRegistryAddresses().accountingModule;
    accountingModule.changeHoldingPosition(longPositionAddress, false);
    accountingModule.changeHoldingPosition(shortPositionAddress, false);
  }

  function rebalance() external canRebalance {
    getRegistryModule().getRegistryAddresses().accountingModule.rebalance();
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
