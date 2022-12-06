// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "opium-auction-v2/contracts/utils/UsingOpiumAuctionV2.sol";

import "../../../utils/Selectors.sol";

import "./BaseStrategy.sol";

library LimitOrderProtocolSelectors {
  bytes4 internal constant LIMIT_ORDER_PROTOCOL_CANCEL_ORDER = bytes4(keccak256(bytes("cancelOrder((uint256,address,address,address,address,address,uint256,uint256,bytes,bytes,bytes,bytes,bytes,bytes,bytes))")));
}

abstract contract OpiumAuctionV2EnabledStrategy is UsingOpiumAuctionV2, BaseStrategy {
  event AuctionStarted(AuctionOrder auctionOrder);
  event AuctionCancelled(AuctionOrder auctionOrder);
  
  address public signMessageLib;

  constructor(address signMessageLib_) {
    signMessageLib = signMessageLib_;
  }

  function _startAuction(AuctionOrder memory auctionOrder_) internal {
    Types.Order memory order = auctionToLimitOrder(auctionOrder_, _registryModule.avatar(), 0);

    bytes32 hashedEncodedOrder = hashOrder(order);

    // Approve sellingAmount to limitOrderProtocol to start auction
    bytes memory approveCalldata = abi.encodeWithSelector(
      Selectors.ERC20_APPROVE,
      limitOrderProtocol,
      auctionOrder_.sellingAmount
    );
    _registryModule.executeOnVault(address(auctionOrder_.sellingToken), approveCalldata);

    // Delegate Call: Sign message
    bytes memory signMessageCalldata = abi.encodeWithSelector(
      Selectors.SAFE_SIGN_MESSAGE,
      abi.encodePacked(hashedEncodedOrder)
    );
    _registryModule.executeOnVaultDelegate(signMessageLib, signMessageCalldata);

    emit AuctionStarted(auctionOrder_);
  }

  function _cancelAuction(AuctionOrder memory auctionOrder_) internal {
    Types.Order memory order = auctionToLimitOrder(auctionOrder_, _registryModule.avatar(), 0);

    // Cancel order on limitOrderProtocol
    bytes memory cancelCalldata = abi.encodeWithSelector(
      LimitOrderProtocolSelectors.LIMIT_ORDER_PROTOCOL_CANCEL_ORDER,
      order
    );
    _registryModule.executeOnVault(limitOrderProtocol, cancelCalldata);

    emit AuctionCancelled(auctionOrder_);
  }

  /**
    @dev Not used here, because order signature is checked against GnosisSafe
   */
  function _isValidOrder(Types.Order memory /** order_ */) internal pure override returns (bool) {
    return true;
  }
}
