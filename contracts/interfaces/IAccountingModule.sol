// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";

interface IAccountingModule {
  event Rebalanced(uint256 totalLiquidityBefore, uint256 profitBeforeFees, uint256 profitFee, uint256 maintenanceFee, uint256 loss);
  event FeeCollectorSet(address indexed previousFeeCollector, address indexed newFeeCollector);
  event ImmediateProfitFeeSet(uint256 previousFee, uint256 newFee);
  event AnnualMaintenanceFeeSet(uint256 previousFee, uint256 newFee);
  event BenchmarkProfitSet(uint256 previousBenchmarkProfit, uint256 newBenchmarkProfit);

  function getUnderlying() external view returns (IERC20MetadataUpgradeable);
  function getTotalLiquidity() external view returns (uint256);
  function getUtilizedLiquidity() external view returns (uint256);
  function getAvailableLiquidity() external view returns (uint256);
  function getLiquidityUtilizationRatio() external view returns (uint256);
  function getAccumulatedFees() external view returns (uint256);
  function hasPosition(address position_) external view returns (bool);
  function getFeeCollector() external view returns (address);
  function getImmediateProfitFee() external view returns (uint256);
  function getAnnualMaintenanceFee() external view returns (uint256);
  function getBenchmarkProfit() external view returns (uint256);
  function calculateRageQuitFee(uint256 principal_) external view returns (uint256);

  function changeTotalLiquidity(uint256 amount_, bool add_) external;
  function changeHoldingPosition(address position_, bool add_) external;
  function rebalance() external;
  function collectFees() external;
  function setFeeCollector(address feeCollector_) external;
  function setImmediateProfitFee(uint256 immediateProfitFee_) external;
  function setAnnualMaintenanceFee(uint256 annualMaintenanceFee_) external;
  function setBenchmarkProfit(uint256 benchmarkProfit_) external;
}
