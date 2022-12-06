// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../../utils/Selectors.sol";

import "./external/opium-protocol/IOpiumRegistry.sol";
import "./external/opium-protocol/IOpiumCore.sol";
import "./external/opium-protocol/IOpiumDerivativeLogic.sol";
import "./external/opium-protocol/LibOpiumCalculator.sol";
import "./external/opium-protocol/IOpiumOnChainPositionsLens.sol";

import "./BaseStrategy.sol";

library OpiumSelectors {
  bytes4 internal constant OPIUM_PROTOCOL_CREATE_AND_MINT = bytes4(keccak256(bytes("createAndMint((uint256,uint256,uint256[],address,address,address),uint256,address[2])")));
  bytes4 internal constant OPIUM_PROTOCOL_REDEEM = bytes4(keccak256(bytes("redeem(address[],uint256)")));
  bytes4 internal constant OPIUM_PROTOCOL_EXECUTE = bytes4(keccak256(bytes("execute(address,uint256)")));
}

abstract contract OpiumProtocolV2EnabledStrategy is BaseStrategy {
  using LibOpiumCalculator for uint256;
  using SafeERC20 for IERC20Metadata;

  event OpiumPositionsMinted(IOpiumCore.Derivative derivative, uint256 quantity);
  event OpiumPositionsRedeemed(IOpiumCore.Derivative derivative, uint256 quantity);
  event OpiumPositionsExecuted(IOpiumCore.Derivative derivative, uint256 quantity, bool long);
  
  /// @notice Reference value (basis) representing 100%
  uint256 public constant BASE = 1e18;

  /// @notice Instance of the Opium Protocol V2 Registry contract
  IOpiumRegistry private _opiumRegistry;
  /// @notice Instance of the Opium Protocol V2 Lens contract
  IOpiumOnChainPositionsLens private _opiumLens;

  /// @notice Constructor of OpiumProtocolV2EnabledStrategy library
  /// @param opiumRegistry_ instance of the Opium Protocol V2 Registry contract
  /// @param opiumLens_ instance of the Opium Protocol V2 Lens contract
  constructor(
    IOpiumRegistry opiumRegistry_,
    IOpiumOnChainPositionsLens opiumLens_
  ) {
    // Setup instance of Opium Registry
    _setOptionRegistry(opiumRegistry_);
    // Setup instance of Opium Lens
    _setOpiumLens(opiumLens_);
  }

  /** Public getters */
  /// @notice Returns the instance of Opium Protocol V2 Registry
  function getOpiumRegistry() external view returns (IOpiumRegistry) {
    return _opiumRegistry;
  }

  /// @notice Returns the instance of Opium Protocol V2 Lens
  function getOpiumLens() external view returns (IOpiumOnChainPositionsLens) {
    return _opiumLens;
  }

  /** Internal getters */

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

  /** Internal setters */
  /// @notice Allows advisor to mint the maximum possible quantity of the provided derivative on the Vault's behalf
  /// @param derivative_ provided derivative to mint
  function _opiumV2MintPositions(IOpiumCore.Derivative memory derivative_) internal returns (address, address, uint256) {
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
      [_registryModule.avatar(), _registryModule.avatar()]
    );
    _registryModule.executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);

    // Calculate addresses of the LONG and SHORT positions
    (address longPositionAddress, address shortPositionAddress) = _opiumLens.predictPositionsAddressesByDerivative(derivative_);

    // Get the instance of the Accounting Module
    IAccountingModule accountingModule = _registryModule.getRegistryAddresses().accountingModule;

    // Notify Accounting Module of the new positions
    accountingModule.changeHoldingPosition(longPositionAddress, true);
    accountingModule.changeHoldingPosition(shortPositionAddress, true);

    emit OpiumPositionsMinted(derivative_, availableQuantity);

    return (longPositionAddress, shortPositionAddress, availableQuantity);
  }

  /// @notice Allows to execute all the positions remaining in the Vault when can Rebalance
  function _opiumV2ExecutePositions(IOpiumCore.Derivative memory derivative_) internal {
    // Calculate LONG + SHORT positions addresses
    (address longPositionAddress, address shortPositionAddress) = _opiumLens.predictPositionsAddressesByDerivative(derivative_);
    // Get the Vault balance of the LONG position
    uint256 longPositionBalance = IERC20Metadata(longPositionAddress).balanceOf(_registryModule.avatar());
    // Get the Vault balance of the SHORT position
    uint256 shortPositionBalance = IERC20Metadata(shortPositionAddress).balanceOf(_registryModule.avatar());

    // Check if positions redemption is possible (meaning Vault holds both LONG and SHORT positions)
    if (longPositionBalance != 0 && shortPositionBalance != 0) {
      // Calculate minimum positions for redemption
      uint256 redeemPositions = longPositionBalance > shortPositionBalance ? shortPositionBalance : longPositionBalance;

      // Redeem positions
      bytes memory data = abi.encodeWithSelector(OpiumSelectors.OPIUM_PROTOCOL_REDEEM, [longPositionAddress,shortPositionAddress], redeemPositions);
      _registryModule.executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);

      longPositionBalance -= redeemPositions;
      shortPositionBalance -= redeemPositions;

      emit OpiumPositionsRedeemed(derivative_, redeemPositions);
    }

    // If any amount of LONG position remains, execute separately
    if (longPositionBalance > 0) {
      bytes memory data = abi.encodeWithSelector(OpiumSelectors.OPIUM_PROTOCOL_EXECUTE, longPositionAddress, longPositionBalance);
      _registryModule.executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);
      emit OpiumPositionsExecuted(derivative_, longPositionBalance, true);
    }

    // If any amount of SHORT position remains, execute separately
    if (shortPositionBalance > 0) {
      bytes memory data = abi.encodeWithSelector(OpiumSelectors.OPIUM_PROTOCOL_EXECUTE, shortPositionAddress, shortPositionBalance);
      _registryModule.executeOnVault(_opiumRegistry.getProtocolAddresses().core, data);
      emit OpiumPositionsExecuted(derivative_, shortPositionBalance, false);
    }

    // Get Accounting Module instance
    IAccountingModule accountingModule = _registryModule.getRegistryAddresses().accountingModule;

    // Notify Accounting Module of the cleared positions
    accountingModule.changeHoldingPosition(longPositionAddress, false);
    accountingModule.changeHoldingPosition(shortPositionAddress, false);
  }

  /** Private setters */
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
}
