// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

/**
    @notice Library with helpers for Schedulers

    Error codes:
        - SCH1 = overflow uint120
 */
library Schedulers {
    uint256 internal constant BASE = 1e18;

    struct ScheduledDeposit {
        uint16 updatedAtEpoch;
        uint120 depositedAssets;
        uint120 scheduledShares;
    }
    struct ScheduledWithdrawal {
        uint16 updatedAtEpoch;
        uint120 withdrawnShares;
        uint120 scheduledAssets;
    }

    /// @notice Process scheduled deposits from previous epochs if any
    /// @param scheduledDeposit_ instance of scheduled deposit
    /// @param sharePriceByEpoch_ mapping that golds share prices by epoch IDs
    /// @param currentEpochId_ current epoch ID
    function processScheduledShares(
        ScheduledDeposit memory scheduledDeposit_,
        mapping(uint16 => uint256) storage sharePriceByEpoch_,
        uint16 currentEpochId_
    )
        internal
        view
        returns (uint256 scheduledShares)
    {
        scheduledShares = scheduledDeposit_.scheduledShares;

        // If there are deposited assets from previous epoch, calculate required shares
        if (
            scheduledDeposit_.updatedAtEpoch < currentEpochId_ &&
            scheduledDeposit_.depositedAssets != 0
        ) {
            scheduledShares +=
                (scheduledDeposit_.depositedAssets *
                    sharePriceByEpoch_[scheduledDeposit_.updatedAtEpoch]) /
                BASE;
        }
    }

    /// @notice Process scheduled withdrawals from previous epochs if any
    /// @param scheduledWithdrawal_ instance of scheduled withdrawal
    /// @param sharePriceByEpoch_ mapping that golds share prices by epoch IDs
    /// @param currentEpochId_ current epoch ID
    function processScheduledAssets(
        ScheduledWithdrawal memory scheduledWithdrawal_,
        mapping(uint16 => uint256) storage sharePriceByEpoch_,
        uint16 currentEpochId_
    )
        internal
        view returns (uint256 scheduledAssets)
    {
        scheduledAssets = scheduledWithdrawal_.scheduledAssets;

        // If there are withdrawn shares from previous epoch, calculate required assets
        if (
            scheduledWithdrawal_.updatedAtEpoch < currentEpochId_ &&
            scheduledWithdrawal_.withdrawnShares != 0
        ) {
            scheduledAssets +=
                (scheduledWithdrawal_.withdrawnShares * BASE) /
                sharePriceByEpoch_[scheduledWithdrawal_.updatedAtEpoch];
        }
    }

    function assertUint120(uint256 num) internal pure {
        require(num <= type(uint120).max, "SCH1");
    }
}
