// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "../interfaces/IRegistryModule.sol";
import "../interfaces/IAccountingModule.sol";
import "../interfaces/IStakingModule.sol";
import "../interfaces/ILifecycleModule.sol";

/// @notice Contract for easy fetching pools data
contract PoolsLens {

  /// @notice Retruns addresses of modules
  /// @param _registryAddress address of Registry module
  function getPoolModules(address _registryAddress) external view returns (
    address stakingAddress,
    address accountingAddress,
    address lifecycleAddress,
    address vaultAddress,
    address strategyAddress
  ) {
    IRegistryAndZodiacModule registryModule = IRegistryAndZodiacModule(_registryAddress);
    IRegistryAndZodiacModule.RegistryAddresses memory addresses = registryModule.getRegistryAddresses();
    return (addresses.stakingModule, address(addresses.accountingModule), address(addresses.lifecycleModule), registryModule.avatar(), addresses.strategyModule);
  }


  struct AccountingDataStruct {
    uint256 poolSize;
    uint256 poolUtilization;
    uint256 managementFee;
    uint256 performanceFee;
    uint256 marginDecimals;
    address marginAddress;
    string marginTitle;
  }

  /// @notice Retruns usable data from Accounting module
  /// @param _accountingAddress address of Accounting module
  function getAccountingData(address _accountingAddress) external view returns (AccountingDataStruct memory) {
    IAccountingModule accountingModule = IAccountingModule(_accountingAddress);
    IERC20MetadataUpgradeable token = accountingModule.getUnderlying();
    return AccountingDataStruct(
      accountingModule.getTotalLiquidity(),
      accountingModule.getLiquidityUtilizationRatio(),
      accountingModule.getAnnualMaintenanceFee(),
      accountingModule.getImmediateProfitFee(),
      token.decimals(),
      address(token),
      token.name()
    );
  }


  struct StakingDataStruct {
    uint256 pendingStake;
    uint256 pendingWithdrawal;
    uint256 userStaked;
    uint256 claimableAssets;
    uint256 claimableShares;
  }

  /// @notice Retruns usable data from Staking module
  /// @param _stakingAddress address of Staking module
  /// @param _lifecycleAddress address of Staking module
  /// @param _userAddress address of user
  function getStakingData(address _stakingAddress, address _lifecycleAddress, address _userAddress) external view returns (StakingDataStruct memory) {
    IStakingWrapper stakingModule = IStakingWrapper(_stakingAddress);
    ILifecycleModule lifecycleModule = ILifecycleModule(_lifecycleAddress);
    
    uint256 pendingStake = lifecycleModule.getEpochId() == stakingModule.scheduledDeposits(_userAddress).updatedAtEpoch  ? stakingModule.scheduledDeposits(_userAddress).depositedAssets : 0;
    uint256 pendingWithdrawal = lifecycleModule.getEpochId() == stakingModule.scheduledWithdrawals(_userAddress).updatedAtEpoch  ? stakingModule.scheduledWithdrawals(_userAddress).withdrawnShares : 0;
    
    return StakingDataStruct(
      pendingStake,
      pendingWithdrawal,
      stakingModule.balanceOf(_userAddress),
      stakingModule.getScheduledAssets(_userAddress),
      stakingModule.getScheduledShares(_userAddress)
    );
  }


  struct LifecycleDataStruct {
    uint256 currentEpochTimestamp;
    uint256 currentEpochStarted;
    uint256[3] phasesLength;
    bool isStakingPhase;
    bool isTradingPhase;
    bool isIdlePhase;
  }

  /// @notice Retruns usable data from Lifecycle module
  /// @param _lifecycleAddress address of Lifecycle module
  function getLifecycleData(address _lifecycleAddress) external view returns (LifecycleDataStruct memory) {
    ILifecycleModule lifecycleModule = ILifecycleModule(_lifecycleAddress);
    return LifecycleDataStruct(
      lifecycleModule.getCurrentEpochEnd(),
      lifecycleModule.getCurrentEpochStart(),
      [
        lifecycleModule.getStakingPhaseLength(), 
        lifecycleModule.getTradingPhaseLength(), 
        lifecycleModule.getEpochLength() - lifecycleModule.getStakingPhaseLength() - lifecycleModule.getTradingPhaseLength()
      ],
      lifecycleModule.isStakingPhase(),
      lifecycleModule.isTradingPhase(),
      lifecycleModule.isIdlePhase()
    );
  }


}
