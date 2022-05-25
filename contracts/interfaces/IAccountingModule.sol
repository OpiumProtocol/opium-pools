// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IAccountingModule {
  function getUnderlying() external view returns (IERC20Metadata);
  function getTotalLiquidity() external view returns (uint256);
  function getUtilizedLiquidity() external view returns (uint256);
  function getAvailableLiquidity() external view returns (uint256);
  function getLiquidityUtilizationRatio() external view returns (uint256);
  function getAccumulatedFees() external view returns (uint256);
  function hasPosition(address position_) external view returns (bool);
  function getFeeCollector() external view returns (address);

  function changeTotalLiquidity(uint256 amount_, bool add_) external;
  function changeHoldingPosition(address position_, bool add_) external;
  function rebalance() external;
  function collectFees() external;
  function setFeeCollector(address feeCollector_) external;
}
