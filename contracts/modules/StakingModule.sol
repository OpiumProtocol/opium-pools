// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../base/RegistryManager.sol";
import "../base/SafeModule.sol";

import "../interfaces/IEIP4626.sol";
import "../interfaces/IAccountingModule.sol";
import "../interfaces/ILifecycleModule.sol";

import "hardhat/console.sol";

/**
    Error codes:
        - S1 = 

 */
contract StakingModule is ERC20Permit, RegistryManager {
    using SafeERC20 for IERC20Metadata;

    // TMP EVENTS
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    // TMP STORAGE

    // STORAGE CANDIDATE

    constructor(
        string memory name_,
        string memory symbol_,
        IRegistryModule registryModule_,
        Executor executor_
    )
        ERC20Permit(name_)
        ERC20(name_, symbol_)
        RegistryManager(registryModule_)
        SafeModule(executor_)
    {}

    modifier canDeposit() {
        require(
            getRegistryModule()
            .getRegistryAddresses()
            .lifecycleModule
            .canDeposit(),
            "can't deposit"
        );
        _;
    }

    modifier canWithdraw() {
        require(
            getRegistryModule()
            .getRegistryAddresses()
            .lifecycleModule
            .canWithdraw(),
            "can't withdraw"
        );
        _;
    }

    // Public getters
    function decimals() override public view returns (uint8) {
        return _getUnderlying().decimals();
    }

    // Public actions
    function deposit(uint256 amount_) external {
        _deposit(amount_, msg.sender);
    }

    function depositFor(uint256 amount_, address receiver_) external {
        _deposit(amount_, receiver_);
    }

    function withdraw(uint256 amount_) external {
        _withdraw(amount_);
    }

    // Private getters
    function _getUnderlying() private view returns (IERC20Metadata) {
        return getRegistryModule()
            .getRegistryAddresses()
            .accountingModule
            .getUnderlying();
    }

    // Private actions
    function _deposit(uint256 amount_, address receiver_) private canDeposit nonReentrant {
        // Transfer tokens in
        _getUnderlying().safeTransferFrom(msg.sender, address(_executor), amount_);
        // Trigger Accounting Module
        getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(amount_, true);
        // Mint shares
        _mint(receiver_, amount_);
        emit Deposited(receiver_, amount_);
    }

    function _withdraw(uint256 amount_) private canWithdraw nonReentrant {
        // Burn shares
        _burn(msg.sender, amount_);
        // Trigger Accounting Module
        getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(amount_, false);
        // Transfer tokens out
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), msg.sender, amount_);
        _executeCall(address(_getUnderlying()), data);
        emit Withdrawn(msg.sender, amount_);
    }
}
