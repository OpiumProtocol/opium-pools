// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "../base/RegistryManager.sol";

/**
    @notice Used to test RegistryManager contract
 */
contract UsingRegistryManager is RegistryManager {
    constructor (
        IRegistryModule registryModule_,
        Executor executor_
    )
        RegistryManager(registryModule_)
        SafeModule(executor_)
    {}
}
