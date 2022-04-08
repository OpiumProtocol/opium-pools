// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "../base/RegistryManager.sol";
import "../base/SafeModule.sol";

import "../interfaces/ILifecycleModule.sol";

contract LifecycleModule is ILifecycleModule, RegistryManager {
    // 10 second buffer for phases to double check and prevent timestamp manipulations
    uint256 public constant TIME_DELTA = 10;

    uint256 private _epochLength;
    uint256 private _stakingPhaseLength;
    uint256 private _tradingPhaseLength;

    uint256 private _currentEpochStart;

    constructor(
        uint256 currentEpochStart_,
        uint256[3] memory lengths_,
        IRegistryModule registryModule_,
        Executor executor_
    )
        RegistryManager(registryModule_)
        SafeModule(executor_)
    {
        _setCurrentEpochStart(currentEpochStart_);
        _setLengths(lengths_);
    }

    modifier onlyStrategyModule() {
        // TODO: Check Strategy Module
        _;
    }

    // Public getters
    function getEpochLength() override external view returns (uint256) {
        return _epochLength;
    }

    function getStakingPhaseLength() override external view returns (uint256) {
        return _stakingPhaseLength;
    }

    function getTradingPhaseLength() override external view returns (uint256) {
        return _tradingPhaseLength;
    }

    function isStakingPhase() override public view returns (bool) {
        // Check if STAKING phase is active
        // current epoch start + TIME_DELTA < now < current epoch start + staking phase length - TIME_DELTA
        return 
            (_currentEpochStart + TIME_DELTA < block.timestamp) &&
            (block.timestamp < _currentEpochStart + _stakingPhaseLength - TIME_DELTA);
    }

    function isTradingPhase() override public view returns (bool) {
        // Check if TRADING phase is active
        // current epoch start + staking phase length + TIME_DELTA < now < current epoch start + staking phase length + trading phase length - TIME_DELTA
        return
            (_currentEpochStart + _stakingPhaseLength + TIME_DELTA < block.timestamp) &&
            (block.timestamp < _currentEpochStart + _stakingPhaseLength + _tradingPhaseLength - TIME_DELTA);
    }

    function isIdlePhase() override public view returns (bool) {
        // Check if IDLE phase is active
        // current epoch start + staking phase length + trading phase length + TIME_DELTA < now
        return _currentEpochStart + _stakingPhaseLength + _tradingPhaseLength + TIME_DELTA < block.timestamp;
    }

    function canDeposit() override external view returns (bool) {
        return isStakingPhase() || isTradingPhase();
    }

    function canWithdraw() override external view returns (bool) {
        return isStakingPhase();
    }

    function canTrade() override external view returns (bool) {
        return isTradingPhase();
    }

    function canRebalance() override external view returns (bool) {
        return isIdlePhase();
    }

    // Private setters
    function _setLengths(uint256[3] memory lengths_) private {
        // Initialize epoch and phases lengths
        _epochLength = lengths_[0];
        _stakingPhaseLength = lengths_[1];
        _tradingPhaseLength = lengths_[2];

        // Validate epoch and phases lengths
        // STAKING_PHASE + TRADING_PHASE < EPOCH: epoch length should be longer than sum of staking and trading phase lengths
        // The rest is considered as an IDLE phase
        require(_stakingPhaseLength + _tradingPhaseLength < _epochLength, "EPOCH_LENGTH_IS_WRONG");
        // STAKING_PHASE > TIME_DELTA * 2
        require(_stakingPhaseLength > TIME_DELTA * 2, "EPOCH_LENGTH_IS_WRONG");
        // TRADING_PHASE > TIME_DELTA * 2
        require(_tradingPhaseLength > TIME_DELTA * 2, "EPOCH_LENGTH_IS_WRONG");
    }

    function _setCurrentEpochStart(uint256 currentEpochStart_) private {
        _currentEpochStart = currentEpochStart_;
    }
}
