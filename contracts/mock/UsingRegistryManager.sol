// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "../base/RegistryManager.sol";

/**
    @notice Used to test RegistryManager contract
 */
contract UsingRegistryManager is RegistryManager {
    function initialize(
        IRegistryAndZodiacModule registryModule_,
        address owner_
    ) external initializer {
        __RegistryManager_init(registryModule_, owner_);
    }
}
