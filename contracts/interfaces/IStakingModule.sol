// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IStakingModule {
  event ScheduledDeposit(address indexed caller, address indexed owner, uint256 assets);
  event UnscheduledDeposit(address indexed owner, uint256 assets);
  event SharesClaimed(address indexed owner, uint256 shares);
  event ScheduledWithdrawal(address indexed caller, address indexed receiver, address indexed owner, uint256 shares);
  event UnscheduledWithdrawal(address indexed owner, uint256 shares);
  event AssetsClaimed(address indexed owner, uint256 assets);

  function postRebalancing() external;
}
