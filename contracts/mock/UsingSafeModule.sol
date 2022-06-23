// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "../base/SafeModule.sol";

/**
    @notice Used to test SafeModule contract
 */
contract UsingSafeModule is SafeModule {
    function initialize(
        Executor executor_
    ) external initializer {
        __SafeModule_init(executor_);
    }
}
