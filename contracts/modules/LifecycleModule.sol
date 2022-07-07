// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "../base/RegistryManager.sol";

import "../interfaces/ILifecycleModule.sol";
import "../interfaces/IStakingModule.sol";

/**
    @notice Lifecycle Module performs lifecycle processes for the pool:
        - keeps track of current epoch
        - keeps track of current phase
        - keeps track of currently allowed actions
        - progresses pool to new epoch
    
    Error cores:
        - LM1 - Only AccountingModule allowed
        - LM2 - Can not rebalance yet
        - LM3 - Epoch length is wrong
 */
contract LifecycleModule is ILifecycleModule, RegistryManager {
    /// @notice 10 second buffer for phases to double check and prevent timestamp manipulations as an additional security measure
    uint256 public constant TIME_DELTA = 10;

    /// @notice Holds the value of the current epoch id (number)
    uint16 private _epochId;
    /// @notice Hold the value of the epoch length
    uint256 private _epochLength;
    /// @notice Hold the value of the Staking Phase length
    uint256 private _stakingPhaseLength;
    /// @notice Holds the value of the Trading Phase length
    uint256 private _tradingPhaseLength;
    /// @notice Holds the timestamp when the current epoch started
    uint256 private _currentEpochStart;

    /// @notice Initializer of the Lifecycle Module
    /// @param currentEpochStart_ timestamp of the start of the first epoch
    /// @param lengths_ an array containing epoch, staking phase and trading phase lengths in seconds
    /// @param registryModule_ instance of a Registry Module to connect to
    /// @param owner_ address of the contract owner
    function initialize(
        uint256 currentEpochStart_,
        uint256[3] memory lengths_,
        IRegistryAndZodiacModule registryModule_,
        address owner_
    )
        external initializer
    {
        // Initialize Registry Manager
        __RegistryManager_init(registryModule_, owner_);
        // Set current epoch start
        _setCurrentEpochStart(currentEpochStart_);
        // Set lengths
        _setLengths(lengths_);
    }

    /// @notice Restricts access to function to Accounting Module only
    modifier onlyAccountingModule() {
        require(
            msg.sender == address(
                getRegistryModule()
                    .getRegistryAddresses()
                    .accountingModule
            ),
            "LM1"
        );
        _;
    }

    // External getters
    /// @notice Returns current epoch ID (number)
    function getEpochId() override external view returns (uint16) {
        return _epochId;
    }

    /// @notice Returns the timestamp of the current epoch start
    function getCurrentEpochStart() override external view returns (uint256) {
        return _currentEpochStart;
    }

    /// @notice Returns the timestamp of the current epoch end
    function getCurrentEpochEnd() override external view returns (uint256) {
        // current epoch end = current epoch start + epoch length
        return _currentEpochStart + _epochLength;
    }

    /// @notice Returns the length of the epoch
    function getEpochLength() override external view returns (uint256) {
        return _epochLength;
    }

    /// @notice Returns the length of the Staking Phase
    function getStakingPhaseLength() override external view returns (uint256) {
        return _stakingPhaseLength;
    }

    /// @notice Returns the length of the Trading Phase
    function getTradingPhaseLength() override external view returns (uint256) {
        return _tradingPhaseLength;
    }

    /// @notice Flags whether current phase is Staking Phase
    function isStakingPhase() override public view returns (bool) {
        // Check if STAKING phase is active
        // current epoch start + TIME_DELTA < now < current epoch start + staking phase length - TIME_DELTA
        return 
            (_currentEpochStart + TIME_DELTA < block.timestamp) &&
            (block.timestamp < _currentEpochStart + _stakingPhaseLength - TIME_DELTA);
    }

    /// @notice Flags whether current phase is Trading Phase
    function isTradingPhase() override public view returns (bool) {
        // Check if TRADING phase is active
        // current epoch start + staking phase length + TIME_DELTA < now < current epoch start + staking phase length + trading phase length - TIME_DELTA
        return
            (_currentEpochStart + _stakingPhaseLength + TIME_DELTA < block.timestamp) &&
            (block.timestamp < _currentEpochStart + _stakingPhaseLength + _tradingPhaseLength - TIME_DELTA);
    }

    /// @notice Flags whether current phase is Idle Phase
    function isIdlePhase() override public view returns (bool) {
        // Check if IDLE phase is active
        // current epoch start + staking phase length + trading phase length + TIME_DELTA < now
        return _currentEpochStart + _stakingPhaseLength + _tradingPhaseLength + TIME_DELTA < block.timestamp;
    }

    /// @notice Flags whether deposits are available right now
    function canDeposit() override external view returns (bool) {
        return isStakingPhase() || isTradingPhase();
    }

    /// @notice Flags whether withdrawals are available right now
    function canWithdraw() override external view returns (bool) {
        return isStakingPhase();
    }

    /// @notice Flags whether trading is available right now
    function canTrade() override external view returns (bool) {
        return isTradingPhase();
    }

    // Public getters
    /// @notice Flags whether the start of the Rebalancing process is possible right now
    function canRebalance() override public view returns (bool) {
        return isIdlePhase() && block.timestamp > _currentEpochStart + _epochLength;
    }

    // External setters
    /// @notice Performs the epoch progressing when asked by the Accounting Module
    function progressEpoch() override external onlyAccountingModule {
        // Check if rebalancing is possible
        require(canRebalance(), "LM2");
        // Set new epoch start
        _setCurrentEpochStart(_currentEpochStart + _epochLength);
        // Increment epoch ID (number)
        _epochId++;
        // Trigger post rebalancing function on Staking Module
        IStakingModule(getRegistryModule().getRegistryAddresses().stakingModule).postRebalancing();
    }

    // Private setters
    /// @dev Private setter of lengths
    /// @param lengths_ an array containing epoch, staking phase and trading phase lengths in seconds
    function _setLengths(uint256[3] memory lengths_) private {
        // Initialize epoch and phases lengths
        _epochLength = lengths_[0];
        _stakingPhaseLength = lengths_[1];
        _tradingPhaseLength = lengths_[2];

        // Validate epoch and phases lengths
        // STAKING_PHASE + TRADING_PHASE < EPOCH: epoch length should be longer than sum of staking and trading phase lengths
        // The rest is considered as an IDLE phase
        require(_stakingPhaseLength + _tradingPhaseLength < _epochLength, "LM3");
        // STAKING_PHASE > TIME_DELTA * 2
        require(_stakingPhaseLength > TIME_DELTA * 2, "LM3");
        // TRADING_PHASE > TIME_DELTA * 2
        require(_tradingPhaseLength > TIME_DELTA * 2, "LM3");
    }

    /// @dev Private setter of current epoch start
    /// @param currentEpochStart_ new epoch start value
    function _setCurrentEpochStart(uint256 currentEpochStart_) private {
        _currentEpochStart = currentEpochStart_;
    }
}
