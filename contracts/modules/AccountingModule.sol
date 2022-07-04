// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "../base/RegistryManager.sol";

import "../interfaces/IAccountingModule.sol";

/**
    @notice Accounting Module performs accounting processes for the pool: calculates total and available liquidity, fees, tracks held positions and participates in Rebalancing process
    Error cores:
        - AM1 = Only StakingModule allowed
        - AM2 = Only StrategyModule allowed
        - AM3 = Wrong input
        - AM4 = Only fee collector allowed
        - AM5 = Not ready for rebalancing
        - AM6 = Only fee collector or executor allowed
 */
contract AccountingModule is IAccountingModule, RegistryManager {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    /// @notice Reference value (basis) representing 100%
    uint256 constant public BASE = 1e18;
    /// @notice Seconds in year stored
    uint256 constant public YEAR_SECONDS = 360 days;

    // Fees
    /// @notice Profit fee value
    uint256 private _immediateProfitFee;
    /// @notice Annual maintenance fee value
    uint256 private _annualMaintenanceFee;
    /// @notice Address of the fees collector
    address private _feeCollector;

    // Accounting
    /// @notice Instance of an underlying ERC20 asset
    IERC20MetadataUpgradeable private _underlying;
    /// @notice Holds the amount of total liquidity that was available during Rebalancing (Staking phase)
    uint256 private _totalLiquidity;
    /// @notice Hold the amount of fees accrued by the system
    uint256 private _accumulatedFees;
    /// @notice Holds the record of all the positions that are currently being held by the Vault
    EnumerableSetUpgradeable.AddressSet private _holdingPositions;

    /// @notice Initializer of the Accounting Module
    /// @param underlying_ instance of an underlying ERC20 token
    /// @param registryModule_ instance of a Registry Module to connect to
    /// @param owner_ address of the contract owner
    function initialize(
        IERC20MetadataUpgradeable underlying_,
        IRegistryAndZodiacModule registryModule_,
        address owner_
    )
        external initializer
    {
        // Initialize Registry Manager
        __RegistryManager_init(registryModule_, owner_);
        // Set underlying asset
        _setUnderlying(underlying_);
        // Set default immediate profit fee to 10%
        _setImmediateProfitFee(0.1e18);
        // Set default annual maintenance fee to 2%
        _setAnnualMaintenanceFee(0.02e18);
    }

    /// @notice Restricts access to function to Staking Module only
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

    /// @notice Restricts access to function to Strategy Module only
    modifier onlyStrategyModule() {
        require(
            (
                msg.sender == getRegistryModule()
                    .getRegistryAddresses()
                    .strategyModule
            ),
            "AM2"
        );
        _;
    }

    /// @notice Restricts access to function to Fee Collector only
    modifier onlyFeeCollector() {
        require(msg.sender == _feeCollector, "AM4");
        _;
    }

    /// @notice Restricts access to function to Fee Collector or Owner only
    modifier onlyFeeCollectorOrOwner() {
        require(
            (
                msg.sender == _feeCollector ||
                msg.sender == owner()
            ),
            "AM6"
        );
        _;
    }

    // External getters
    /// @notice Returns an underlying ERC20 asset instance
    function getUnderlying() override external view returns (IERC20MetadataUpgradeable) {
        return _underlying;
    }

    /// @notice Returns the amount of total liquidity available during Rebalancing (Staking phase)
    function getTotalLiquidity() override external view returns (uint256) {
        return _totalLiquidity;
    }

    /// @notice Returns the amount of currently utilized liquidity
    function getUtilizedLiquidity() override public view returns (uint256) {
        // Get the available liquidity
        uint256 availableLiquidity = getAvailableLiquidity();

        // If available liquidity is greater than total liquidity, then utilization is 0, we have a surplus here
        if (_totalLiquidity < availableLiquidity) {
            return 0;
        }

        // Otherwise return the difference between total liquidity and available liquidity
        return _totalLiquidity - availableLiquidity;
    }

    /// @notice Returns currently available liquidity in the Vault
    function getAvailableLiquidity() override public view returns (uint256) {
        // Get the current underlying balance of the Vault
        uint256 poolBalance = _underlying.balanceOf(getRegistryModule().avatar());

        // Check that Vault balance is greater than accumulated fees to mitigate underflow errors
        if (poolBalance < _accumulatedFees) {
            return 0;
        }

        // Subtract accumulated frees from the Vault's balance
        return  poolBalance - _accumulatedFees;
    }

    /// @notice Returns current pool's utilization ratio in % denominated in 1e18
    function getLiquidityUtilizationRatio() override external view returns (uint256) {
        // If total liquidity is 0, then utilization is also 0
        if (_totalLiquidity == 0) {
            return 0;
        }

        // utilization ratio = utilized liquidity / total liquidity
        return getUtilizedLiquidity() * BASE / _totalLiquidity;
    }

    /// @notice Returns the value of accumulated fees
    function getAccumulatedFees() override external view returns (uint256) {
        return _accumulatedFees;
    }

    /// @notice Returns the fact whether provided position address is being held by the strategy
    /// @param position_ address of the position
    function hasPosition(address position_) override external view returns (bool) {
        return _holdingPositions.contains(position_);
    }

    /// @notice Returns the address of the Fee Collector
    function getFeeCollector() override external view returns (address) {
        return _feeCollector;
    }

    /// @notice Returns the value of the immediate profit fee
    function getImmediateProfitFee() override external view returns (uint256) {
        return _immediateProfitFee;
    }

    /// @notice Returns the value of the annual maintenance fee
    function getAnnualMaintenanceFee() override external view returns (uint256) {
        return _annualMaintenanceFee;
    }

    // External setters
    /// @notice Changes the total liquidity amount when asked by Staking Module
    /// @param amount_ amount to increment or decrement
    /// @param add_ flag telling whether `amount_` should be added or subtracted from the total liquidity
    function changeTotalLiquidity(uint256 amount_, bool add_) override external onlyStakingModule {
        if (add_) {
            _setTotalLiquidity(_totalLiquidity + amount_);
        } else {
            _setTotalLiquidity(_totalLiquidity - amount_);
        }
    }

    /// @notice Changes the holding position when asked by Strategy Module
    /// @param position_ address of the position to add or remove
    /// @param add_ flag telling whether `position_` should be added or removed from the holding positions
    function changeHoldingPosition(address position_, bool add_) override external onlyStrategyModule {
        if (add_) {
            _holdingPositions.add(position_);
        } else {
            _holdingPositions.remove(position_);
        }
    }

    /// @notice Performs the accounting when asked by the Strategy Module
    function rebalance() override external onlyStrategyModule {
        // Check whether strategy got rid of all the positions before initializing the rebalancing
        require(_holdingPositions.length() == 0, "AM5");

        // Calculate the balance at the beginning of the epoch by adding
        // previous balance = total liquidity + accumulated fees
        uint256 previousBalance = _totalLiquidity + _accumulatedFees;
        // Calculate current balance of the Vault
        uint256 currentBalance = _underlying.balanceOf(getRegistryModule().avatar());

        // If current balance is greater than the previous balance, then pool has made profit in the current epoch and the system need to subtract fees
        if (currentBalance > previousBalance) {
            // Calculate the gained profit
            uint256 profit = currentBalance - previousBalance;
            // Calculate immediate profit fee
            uint256 profitFee = profit * _immediateProfitFee / BASE;
            // Subtract profit fee from the profit
            profit -= profitFee;
            // Calculate portion of the annual maintenance fee based on the epoch length
            // maintenance fee = total liquidity * annual maintenance fee * epoch length / year length
            uint256 maintenanceFee = 
                _totalLiquidity
                    * _annualMaintenanceFee
                    * getRegistryModule().getRegistryAddresses().lifecycleModule.getEpochLength()
                    / YEAR_SECONDS
                    / BASE;
            // Set new accumulated fees
            _setAccumulatedFees(_accumulatedFees + profitFee + maintenanceFee);
            // Set new total liquidity
            _setTotalLiquidity(_totalLiquidity + profit - maintenanceFee);
        } else {
            // If current balance is less than or equal to previous one, then poll did not make any profit
            // Calculate the loss
            uint256 loss = previousBalance - currentBalance;
            // Set new total liquidity
            _setTotalLiquidity(_totalLiquidity - loss);
        }

        // Trigger Lifecycle Module to progress epoch and perform its internal logic
        getRegistryModule().getRegistryAddresses().lifecycleModule.progressEpoch();
    }

    /// @notice Claims all the accumulated fees when asked by Fee Collector
    function collectFees() override external onlyFeeCollector {
        // Cache accumulated fees
        uint256 accumulatedFees = _accumulatedFees;
        // Set accumulated fees to zero
        _setAccumulatedFees(0);
        // Transfer fees out
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), msg.sender, accumulatedFees);
        getRegistryModule().executeOnVault(address(_underlying), data);
    }

    /// @notice Sets the new fee collector address when asked by current Fee Collector or Owner
    /// @param feeCollector_ new Fee Collector address
    function setFeeCollector(address feeCollector_) override external onlyFeeCollectorOrOwner {
        _setFeeCollector(feeCollector_);
    }

    /// @notice Sets new immediate profit fee when asked by Owner
    /// @param immediateProfitFee_ new value of the immediate profit fee
    function setImmediateProfitFee(uint256 immediateProfitFee_) override external onlyOwner {
        _setImmediateProfitFee(immediateProfitFee_);
    }

    /// @notice Sets new annual maintenance fee when asked by Owner
    /// @param annualMaintenanceFee_ new value of the annual maintenance fee
    function setAnnualMaintenanceFee(uint256 annualMaintenanceFee_) override external onlyOwner {
        _setAnnualMaintenanceFee(annualMaintenanceFee_);
    }

    // Private setters
    /// @dev Private setter of underlying ERC20 instance with input sanitizing
    /// @param underlying_ new instance of the underlying asset to set
    function _setUnderlying(IERC20MetadataUpgradeable underlying_) private {
        // Check if not a zero address
        require(address(underlying_) != address(0), "AM3");
        _underlying = underlying_;
    }

    /// @dev Private setter of total liquidity
    /// @param totalLiquidity_ new total liquidity
    function _setTotalLiquidity(uint256 totalLiquidity_) private {
        _totalLiquidity = totalLiquidity_;
    }
    
    /// @dev Private setter of accumulated fees
    /// @param accumulatedFees_ new accumulated fees
    function _setAccumulatedFees(uint256 accumulatedFees_) private {
        _accumulatedFees = accumulatedFees_;
    }

    /// @dev Private setter of Fee Collector address
    /// @param feeCollector_ new Fee Collector address
    function _setFeeCollector(address feeCollector_) private {
        _feeCollector = feeCollector_;
    }

    /// @dev Private setter of immediate profit fee
    /// @param immediateProfitFee_ new immediate profit fee
    function _setImmediateProfitFee(uint256 immediateProfitFee_) private {
        _immediateProfitFee = immediateProfitFee_;
    }

    /// @dev Private setter of annual maintenance fee
    /// @param annualMaintenanceFee_ new annual maintenance fee
    function _setAnnualMaintenanceFee(uint256 annualMaintenanceFee_) private {
        _annualMaintenanceFee = annualMaintenanceFee_;
    }
}
