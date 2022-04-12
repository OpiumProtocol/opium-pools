// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "../base/RegistryManager.sol";
import "../base/SafeModule.sol";

import "../interfaces/IAccountingModule.sol";

contract AccountingModule is IAccountingModule, RegistryManager {
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 constant public BASE = 1e18;
    uint256 constant public FEE = 0.01e18;

    IERC20Metadata private _underlying;

    uint256 private _totalLiquidity;
    uint256 private _utilizedLiquidity;
    uint256 private _accumulatedFees;

    // THINK: Maybe useless?
    EnumerableSet.AddressSet private _holdingPositions;

    constructor(
        IERC20Metadata underlying_,
        IRegistryModule registryModule_,
        Executor executor_
    )
        RegistryManager(registryModule_)
        SafeModule(executor_)
    {
        _setUnderlying(underlying_);
    }

    modifier onlyStakingModule() {
        require(
            msg.sender == getRegistryModule()
                .getRegistryAddresses()
                .stakingModule,
            "not allowed"
        );
        _;
    }

    modifier onlyStrategyModule() {
        // TODO: Check Strategy Module
        _;
    }

    // External getters
    function getUnderlying() override external view returns (IERC20Metadata) {
        return _underlying;
    }

    function getTotalLiquidity() override external view returns (uint256) {
        return _totalLiquidity;
    }

    function getUtilizedLiquidity() override external view returns (uint256) {
        return _utilizedLiquidity;
    }

    function getAvailableLiquidity() override external view returns (uint256) {
        return _totalLiquidity - _utilizedLiquidity;
    }

    function getLiquidityUtilizationRatio() override external view returns (uint256) {
        return _utilizedLiquidity * BASE / _totalLiquidity;
    }

    function getAccumulatedFees() override external view returns (uint256) {
        return _accumulatedFees;
    }

    function hasPosition(address position_) override external view returns (bool) {
        return _holdingPositions.contains(position_);
    }

    // External setters
    function changeTotalLiquidity(uint256 amount_, bool add_) override external onlyStakingModule {
        if (add_) {
            _setTotalLiquidity(_totalLiquidity + amount_);
        } else {
            _setTotalLiquidity(_totalLiquidity - amount_);
        }
    }

    function changeHoldingPosition(address position_, bool add_) override external onlyStrategyModule {
        if (add_) {
            if (!_holdingPositions.contains(position_)) {
                _holdingPositions.add(position_);
            }
        } else {
            if (_holdingPositions.contains(position_)) {
                _holdingPositions.remove(position_);
            }
        }
    }

    function rebalance() override external onlyStrategyModule {
        require(_holdingPositions.length() == 0, "not ready for rebalancing");

        uint256 previousBalance = _totalLiquidity + _accumulatedFees;
        uint256 currentBalance = _underlying.balanceOf(address(_executor));

        // Made profit
        if (currentBalance > previousBalance) {
            uint256 profit = currentBalance - previousBalance;
            uint256 fee = profit * FEE / BASE;
            profit -= fee;
            _setAccumulatedFees(_accumulatedFees + fee);
            _setTotalLiquidity(_totalLiquidity + profit);
        } else {
            // Made losses
            uint256 loss = previousBalance - currentBalance;
            _setTotalLiquidity(_totalLiquidity - loss);
        }

        getRegistryModule().getRegistryAddresses().lifecycleModule.progressEpoch();
    }

    // Private setters
    function _setUnderlying(IERC20Metadata underlying_) private {
        // TODO: Sanitize
        _underlying = underlying_;
    }

    function _setTotalLiquidity(uint256 totalLiquidity_) private {
        _totalLiquidity = totalLiquidity_;
    }

    function _setAccumulatedFees(uint256 accumulatedFees_) private {
        _accumulatedFees = accumulatedFees_;
    }
}
