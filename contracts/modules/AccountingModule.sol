// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "../base/RegistryManager.sol";

import "../interfaces/IAccountingModule.sol";

import "hardhat/console.sol";

/**
    @notice Accounting Module performs accounting processes for the pool: calculates total and available liquidity, fees and tracks held positions
    Error cores:
        - AM1 = Only StakingModule allowed
        - AM2 = Only enabled strategy allowed
        - AM3 = Wrong input
        - AM4 = Only fee collector allowed
        - AM5 = Not ready for rebalancing
        - AM6 = Only fee collector or executor allowed
 */
contract AccountingModule is IAccountingModule, RegistryManager {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    uint256 constant public BASE = 1e18;
    uint256 constant public YEAR_SECONDS = 360 days;

    // Fees
    uint256 private _immediateProfitFee;
    uint256 private _annualMaintenanceFee;
    address private _feeCollector;

    // Accounting
    IERC20MetadataUpgradeable private _underlying;

    uint256 private _totalLiquidity;
    uint256 private _accumulatedFees;

    EnumerableSetUpgradeable.AddressSet private _holdingPositions;

    function initialize(
        IERC20MetadataUpgradeable underlying_,
        IRegistryModule registryModule_,
        Executor executor_
    )
        external initializer
    {
        __RegistryManager_init(registryModule_, executor_);
        _setUnderlying(underlying_);
        _setImmediateProfitFee(0.1e18);
        _setAnnualMaintenanceFee(0.02e18);
    }

    modifier onlyStakingModule() {
        require(
            (
                msg.sender == getRegistryModule()
                    .getRegistryAddresses()
                    .stakingModule
            ),
            "AM1"
        );
        _;
    }

    modifier onlyStrategyModule() {
        require(
            getRegistryModule().isStrategyEnabled(msg.sender),
            "AM2"
        );
        _;
    }

    modifier onlyFeeCollector() {
        require(msg.sender == _feeCollector, "AM4");
        _;
    }

    modifier onlyFeeCollectorOrExecutor() {
        require(
            (
                msg.sender == _feeCollector ||
                msg.sender == address(_executor)
            ),
            "AM6"
        );
        _;
    }

    // External getters
    function getUnderlying() override external view returns (IERC20MetadataUpgradeable) {
        return _underlying;
    }

    function getTotalLiquidity() override external view returns (uint256) {
        return _totalLiquidity;
    }

    function getUtilizedLiquidity() override public view returns (uint256) {
        uint256 availableLiquidity = getAvailableLiquidity();

        if (_totalLiquidity < availableLiquidity) {
            return 0;
        }

        return _totalLiquidity - availableLiquidity;
    }

    function getAvailableLiquidity() override public view returns (uint256) {
        uint256 poolBalance = _underlying.balanceOf(address(_executor));
        if (poolBalance < _accumulatedFees) {
            return 0;
        }

        return  poolBalance - _accumulatedFees;
    }

    function getLiquidityUtilizationRatio() override external view returns (uint256) {
        if (_totalLiquidity == 0) {
            return 0;
        }

        return getUtilizedLiquidity() * BASE / _totalLiquidity;
    }

    function getAccumulatedFees() override external view returns (uint256) {
        return _accumulatedFees;
    }

    function hasPosition(address position_) override external view returns (bool) {
        return _holdingPositions.contains(position_);
    }

    function getFeeCollector() override external view returns (address) {
        return _feeCollector;
    }

    function getImmediateProfitFee() override external view returns (uint256) {
        return _immediateProfitFee;
    }

    function getAnnualMaintenanceFee() override external view returns (uint256) {
        return _annualMaintenanceFee;
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
            _holdingPositions.add(position_);
        } else {
            _holdingPositions.remove(position_);
        }
    }

    function rebalance() override external onlyStrategyModule {
        require(_holdingPositions.length() == 0, "AM5");

        uint256 previousBalance = _totalLiquidity + _accumulatedFees;
        uint256 currentBalance = _underlying.balanceOf(address(_executor));

        // Made profit
        if (currentBalance > previousBalance) {
            uint256 profit = currentBalance - previousBalance;
            uint256 profitFee = profit * _immediateProfitFee / BASE;
            profit -= profitFee;
            uint256 maintenanceFee = 
                _totalLiquidity
                    * _annualMaintenanceFee
                    * getRegistryModule().getRegistryAddresses().lifecycleModule.getEpochLength()
                    / YEAR_SECONDS
                    / BASE;
            _setAccumulatedFees(_accumulatedFees + profitFee + maintenanceFee);
            _setTotalLiquidity(_totalLiquidity + profit - maintenanceFee);
        } else {
            // Made losses
            uint256 loss = previousBalance - currentBalance;
            _setTotalLiquidity(_totalLiquidity - loss);
        }

        getRegistryModule().getRegistryAddresses().lifecycleModule.progressEpoch();
    }

    function collectFees() override external onlyFeeCollector {
        // Cache accumulated fees
        uint256 accumulatedFees = _accumulatedFees;
        // Set accumulated fees to zero
        _setAccumulatedFees(0);
        // Transfer fees out
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), msg.sender, accumulatedFees);
        _executeCall(address(_underlying), data);
    }

    function setFeeCollector(address feeCollector_) override external onlyFeeCollectorOrExecutor {
        _setFeeCollector(feeCollector_);
    }

    function setImmediateProfitFee(uint256 immediateProfitFee_) override external onlyExecutor {
        _setImmediateProfitFee(immediateProfitFee_);
    }

    function setAnnualMaintenanceFee(uint256 annualMaintenanceFee_) override external onlyExecutor {
        _setAnnualMaintenanceFee(annualMaintenanceFee_);
    }

    // Private setters
    function _setUnderlying(IERC20MetadataUpgradeable underlying_) private {
        require(address(underlying_) != address(0), "AM3");
        _underlying = underlying_;
    }

    function _setTotalLiquidity(uint256 totalLiquidity_) private {
        _totalLiquidity = totalLiquidity_;
    }

    function _setAccumulatedFees(uint256 accumulatedFees_) private {
        _accumulatedFees = accumulatedFees_;
    }

    function _setFeeCollector(address feeCollector_) private {
        _feeCollector = feeCollector_;
    }

    function _setImmediateProfitFee(uint256 immediateProfitFee_) private {
        _immediateProfitFee = immediateProfitFee_;
    }

    function _setAnnualMaintenanceFee(uint256 annualMaintenanceFee_) private {
        _annualMaintenanceFee = annualMaintenanceFee_;
    }
}
