// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IStakingModule {
  event ScheduledDeposit(address indexed caller, address indexed owner, uint256 assets);
  event UnscheduledDeposit(address indexed owner, uint256 assets);
  event SharesClaimed(address indexed owner, uint256 shares);
  event ScheduledWithdrawal(address indexed caller, address indexed receiver, address indexed owner, uint256 shares);
  event UnscheduledWithdrawal(address indexed owner, uint256 shares);
  event AssetsClaimed(address indexed owner, uint256 assets);
  event RageQuit(address indexed caller, address indexed receiver, address indexed owner, uint256 shares);
  event Referral(uint256 indexed id);

  function canDeposit() external view returns (bool);
  function canWithdraw() external view returns (bool);
  function getScheduledShares(address receiver) external view returns (uint256 scheduledShares);
  function getScheduledAssets(address receiver) external view returns (uint256 scheduledAssets);

  function depositRef(uint256 assets, address receiver, uint256 referralId) external returns (uint256 shares);
  function mintRef(uint256 shares, address receiver, uint256 referralId) external returns (uint256 assets);
  function scheduleDeposit(uint256 assets, address receiver) external returns (uint256 shares);
  function scheduleDepositRef(uint256 assets, address receiver, uint256 referralId) external returns (uint256 shares);
  function unscheduleDeposit(uint256 assets) external;
  function claimScheduledShares(uint256 shares, bool claimAll) external;
  function scheduleWithdrawal(uint256 shares, address receiver, address owner) external returns (uint256 assets);
  function unscheduleWithdrawal(uint256 shares) external;
  function claimScheduledAssets(uint256 assets, bool claimAll) external;
  function rageQuit(uint256 shares, address receiver, address owner, address[] calldata tokens) external;
  function postRebalancing() external;
}
