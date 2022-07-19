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

import "../../utils/Selectors.sol";

library OpiumSelectors {
  bytes4 internal constant OPIUM_PROTOCOL_CREATE_AND_MINT = bytes4(keccak256(bytes("createAndMint((uint256,uint256,uint256[],address,address,address),uint256,address[2])")));
  bytes4 internal constant OPIUM_PROTOCOL_REDEEM = bytes4(keccak256(bytes("redeem(address[],uint256)")));
  bytes4 internal constant OPIUM_PROTOCOL_EXECUTE = bytes4(keccak256(bytes("execute(address,uint256)")));
}

/**
  @notice OptionsSellingStrategyModule allows:
    - advisors to mint desired derivatives using Vault's assets, set up premiums for minted positions
    - anyone to purchase desired positions if the premium is set, execute positions when possible and start the rebalancing process
  Error cores:
    - OSSM1 = Not trading phase
    - OSSM2 = Can't rebalance yet
    - OSSM3 = Wrong derivative end time
    - OSSM4 = Purchase conditions are not met
 */
contract OptionsSellingStrategyModule is IStrategyModule, RegistryManager, AccessControlUpgradeable {
  using LibOpiumCalculator for uint256;
  using SafeERC20Upgradeable for IERC20MetadataUpgradeable;

  /// @notice Constant containing the hash of the ADVISOR_ROLE
  bytes32 public constant ADVISOR_ROLE = keccak256("ADVISOR_ROLE");
  
  /// @notice Reference value (basis) representing 100%
  uint256 public constant BASE = 1e18;

  /// @notice Instance of the Opium Protocol V2 Registry contract
  IOpiumRegistry private _opiumRegistry;
  /// @notice Instance of the Opium Protocol V2 Lens contract
  IOpiumOnChainPositionsLens private _opiumLens;

  /// @notice Holds premiums for the positions that are available to be purchased
  mapping (address => uint256) private _premiums;

  /// @notice Initializer of the Strategy Module
  /// @param opiumRegistry_ instnace of the Opium Protocol V2 Registry contract
  /// @param opiumLens_ instance of the Opium Protocol V2 Lens contract
  /// @param registryModule_ instance of a Registry Module to connect to
  /// @param owner_ address of the contract owner
  function initialize(
    IOpiumRegistry opiumRegistry_,
    IOpiumOnChainPositionsLens opiumLens_,
    IRegistryAndZodiacModule registryModule_,
    address owner_
  )
    external initializer
  {
    // Initialize Registry Manager
    __RegistryManager_init(registryModule_, owner_);
    // Give DEFAULT_ADMIN_ROLE to the owner
    _setupRole(DEFAULT_ADMIN_ROLE, address(owner_));
    // Setup instance of Opium Registry
    _setOptionRegistry(opiumRegistry_);
    // Setup instance of Opium Lens
    _setOpiumLens(opiumLens_);
  }

  /// @notice Restricts access to function to be callable only when Trading Phase is active
  modifier canTrade() {
    require(
      _registryModule
        .getRegistryAddresses()
        .lifecycleModule
        .canTrade(),
        "OSSM1"
    );
    _;
  }

  /// @notice Restricts access to function to be callable only when Rebalancing is available
  modifier canRebalance() {
    require(
      _registryModule
        .getRegistryAddresses()
        .lifecycleModule
        .canRebalance(),
        "OSSM2"
    );
    _;
  }

  // Public getters
  /// @notice Returns the instance of Opium Protocol V2 Registry
  function getOpiumRegistry() external view returns (IOpiumRegistry) {
    return _opiumRegistry;
  }

  /// @notice Returns the instance of Opium Protocol V2 Lens
  function getOpiumLens() external view returns (IOpiumOnChainPositionsLens) {
    return _opiumLens;
  }

  /// @notice Returns the premium set for the provided position
  /// @param position_ position to return the premium for
  function getPremium(address position_) external view returns (uint256) {
    return _premiums[position_];
  }

  /// @notice Calculates the available quantity of the provided derivative to that's possible to mint with the current Vault's liquidity as well as the margin required to be locked within the minting process
  /// @param derivative_ provided derivative to mint
  function getAvailableQuantity(IOpiumCore.Derivative memory derivative_) public view returns (uint256 availableQuantity, uint256 requiredMargin) {
    // Get available liquidity
    uint256 availableLiquidity = _registryModule.getRegistryAddresses().accountingModule.getAvailableLiquidity();
    // Get required margin per contract
    uint256[2] memory margins;
    (margins[0], margins[1]) = IOpiumDerivativeLogic(derivative_.syntheticId).getMargin(derivative_);
    // Add LONG and SHORT positions margins together
    uint256 totalMargin = margins[0] + margins[1];

    // Calculate the available quantity to mint
    availableQuantity = availableLiquidity * BASE / totalMargin;
    // Calculate the required margin to mint
    requiredMargin = availableQuantity * totalMargin / BASE;
  }

  // External setters
  /// @notice Allows advisor to mint the maximum possible quantity of the provided derivative on the Vault's behalf
  /// @param derivative_ provided derivative to mint
  function mintPositions(IOpiumCore.Derivative memory derivative_) external canTrade onlyRole(ADVISOR_ROLE) {
    // Get the Lifecycle Module instance
    ILifecycleModule lifecycleModule = _registryModule.getRegistryAddresses().lifecycleModule;
    // Check that the provided derivative's end time doesn't exceed the current epoch's end
    require(lifecycleModule.getCurrentEpochEnd() >= derivative_.endTime, "OSSM3");
    // Get available quantity and required margin
    (uint256 availableQuantity, uint256 requiredMargin) = getAvailableQuantity(derivative_);

    // Approve margin to TokenSpender to create positions
    bytes memory data = abi.encodeWithSelector(
      Selectors.ERC20_APPROVE,
      _opiumRegistry.getProtocolAddresses().tokenSpender,
      requiredMargin
    );
    _registryModule.executeOnVault(derivative_.token, data);

    // Create positions
    data = abi.encodeWithSelector(
      OpiumSelectors.OPIUM_PROTOCOL_CREATE_AND_MINT,
      derivative_,
      availableQuantity,
      [_registryModule.avatar(),_registryModule.avatar()]
    );
    _registryModule.executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);

    // Calculate addresses of the LONG and SHORT positions
    (address longPositionAddress, address shortPositionAddress) = _opiumLens.predictPositionsAddressesByDerivative(derivative_);

    // Get the instance of the Accounting Module
    IAccountingModule accountingModule = _registryModule.getRegistryAddresses().accountingModule;

    // Notify Accounting Module of the new positions
    accountingModule.changeHoldingPosition(longPositionAddress, true);
    accountingModule.changeHoldingPosition(shortPositionAddress, true);
  }

  /// @notice Sets premium for a given position when asked by Advisor
  /// @param position_ Position to set the premium to
  /// @param premium_ Premium to set for the given position
  function setPremium(address position_, uint256 premium_) external onlyRole(ADVISOR_ROLE) {
    _setPremium(position_, premium_);
  }

  /// @notice Allows to obtain the provided quantity of the given position from the Vault by paying the required premium
  /// @param position_ Position to purchase
  /// @param quantity_ Amount of positions that purchaser is willing to buy
  /// @param maxPremium_ Maximum premium per position that purchaser is willing to pay
  function purchasePosition(address position_, uint256 quantity_, uint256 maxPremium_) external canTrade {
    // Get Accounting Module instance
    IAccountingModule accountingModule = _registryModule.getRegistryAddresses().accountingModule;

    // Check that the premium for given position was set and doesn't exceed the maximum premium provided by purchaser
    require(
      _premiums[position_] != 0 &&
      _premiums[position_] <= maxPremium_,
      "OSSM4"
    );

    // Transfer premium in
    accountingModule.getUnderlying().safeTransferFrom(msg.sender, _registryModule.avatar(), quantity_ * _premiums[position_] / BASE);
    // Transfer positions out
    bytes memory data = abi.encodeWithSelector(Selectors.ERC20_TRANSFER, msg.sender, quantity_);
    _registryModule.executeOnVault(position_, data);
  }

  /// @notice Allows to execute all the positions remaining in the Vault when can Rebalance
  function executePositions(IOpiumCore.Derivative memory derivative_) external canRebalance {
    // Calculate LONG + SHORT positions addresses
    (address longPositionAddress, address shortPositionAddress) = _opiumLens.predictPositionsAddressesByDerivative(derivative_);
    // Get the Vault balance of the LONG position
    uint256 longPositionBalance = IERC20MetadataUpgradeable(longPositionAddress).balanceOf(_registryModule.avatar());
    // Get the Vault balance of the SHORT position
    uint256 shortPositionBalance = IERC20MetadataUpgradeable(shortPositionAddress).balanceOf(_registryModule.avatar());

    // Check if positions redemption is possible (meaning Vault holds both LONG and SHORT positions)
    if (longPositionBalance != 0 && shortPositionBalance != 0) {
      // Calculate minimum positions for redemption
      uint256 redeemPositions = longPositionBalance > shortPositionBalance ? shortPositionBalance : longPositionBalance;

      // Redeem positions
      bytes memory data = abi.encodeWithSelector(OpiumSelectors.OPIUM_PROTOCOL_REDEEM, [longPositionAddress,shortPositionAddress], redeemPositions);
      _registryModule.executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);

      longPositionBalance -= redeemPositions;
      shortPositionBalance -= redeemPositions;
    }

    // If any amount of LONG position remains, execute separately
    if (longPositionBalance > 0) {
      bytes memory data = abi.encodeWithSelector(OpiumSelectors.OPIUM_PROTOCOL_EXECUTE, longPositionAddress, longPositionBalance);
      _registryModule.executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);
    }

    // If any amount of SHORT position remains, execute separately
    if (shortPositionBalance > 0) {
      bytes memory data = abi.encodeWithSelector(OpiumSelectors.OPIUM_PROTOCOL_EXECUTE, shortPositionAddress, shortPositionBalance);
      _registryModule.executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);
    }

    // Get Accounting Module instance
    IAccountingModule accountingModule = _registryModule.getRegistryAddresses().accountingModule;

    // Notify Accounting Module of the cleared positions
    accountingModule.changeHoldingPosition(longPositionAddress, false);
    accountingModule.changeHoldingPosition(shortPositionAddress, false);
  }

  /// @notice Trigger Accounting Module to start rebalancing process only when Rebalancing is possible
  function rebalance() external canRebalance {
    _registryModule.getRegistryAddresses().accountingModule.rebalance();
  }

  // Private setters
  /// @dev Private setter of Opium Registry
  /// @param opiumRegistry_ new Opium Registry
  function _setOptionRegistry(IOpiumRegistry opiumRegistry_) private {
    _opiumRegistry = opiumRegistry_;
  }

  /// @dev Private setter of Opium Lens
  /// @param opiumLens_ new Opium Lens
  function _setOpiumLens(IOpiumOnChainPositionsLens opiumLens_) private {
    _opiumLens = opiumLens_;
  }

  /// @dev Private setter of premium for a given position
  /// @param position_ position address
  /// @param premium_ new premium
  function _setPremium(address position_, uint256 premium_) private {
    _premiums[position_] = premium_;
  }
}
