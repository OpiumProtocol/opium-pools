// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "../base/RegistryManager.sol";

import "../interfaces/IEIP4626.sol";

import { FixedPointMathLib } from "../utils/FixedPointMathLib.sol";

import "hardhat/console.sol";

/**
    Error codes:
        - S1 = can't deposit
        - S2 = can't withdraw
        - S3 = zero shares on deposit
        - S4 = zero assets on redemption
 */
contract StakingModule is IEIP4626, ERC165, ERC20Permit, RegistryManager {
    using SafeERC20 for IERC20Metadata;
    using FixedPointMathLib for uint256;

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

    /* MODIFIERS */

    modifier canDeposit() {
        require(
            getRegistryModule()
            .getRegistryAddresses()
            .lifecycleModule
            .canDeposit(),
            "S1"
        );
        _;
    }

    modifier canWithdraw() {
        require(
            getRegistryModule()
            .getRegistryAddresses()
            .lifecycleModule
            .canWithdraw(),
            "S2"
        );
        _;
    }

    /* PUBLIC */

    /* PUBLIC -> GETTERS */

    // Overrides ERC20.decimals to match underlying token's decimals
    function decimals() override public view returns (uint8) {
        return _getUnderlying().decimals();
    }

    // Overrides ERC165
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IEIP4626).interfaceId || super.supportsInterface(interfaceId);
    }

    /* PUBLIC -> GETTERS -> EIP4626 */
    function asset() override external view returns (address assetTokenAddress) {
        assetTokenAddress = address(_getUnderlying());
    }

    function totalAssets() override public view returns (uint256 totalManagedAssets) {
        totalManagedAssets = getRegistryModule()
            .getRegistryAddresses()
            .accountingModule
            .getTotalLiquidity();
    }

    function convertToShares(uint256 assets) override public view returns (uint256 shares) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        shares = supply == 0 ? assets : assets.mulDivDown(supply, totalAssets());
    }

    function convertToAssets(uint256 shares) override public view returns (uint256 assets) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        assets = supply == 0 ? shares : shares.mulDivDown(totalAssets(), supply);
    }

    function maxDeposit(address) override external pure returns (uint256 maxAssets) {
        // TODO: Implement
        maxAssets = type(uint256).max;
    }

    function previewDeposit(uint256 assets) override public view returns (uint256 shares) {
        shares = convertToShares(assets);
    }

    function maxMint(address) override external pure returns (uint256 maxShares) {
        // TODO: Implement
        maxShares = type(uint256).max;
    }

    function previewMint(uint256 shares) override public view returns (uint256 assets) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        assets = supply == 0 ? shares : shares.mulDivUp(totalAssets(), supply);
    }

    function maxWithdraw(address owner) override external view returns (uint256 maxAssets) {
        maxAssets = convertToAssets(balanceOf(owner));
    }

    function previewWithdraw(uint256 assets) override public view returns (uint256 shares) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        shares = supply == 0 ? assets : assets.mulDivUp(supply, totalAssets());
    }

    function maxRedeem(address owner) override external view returns (uint256 maxShares) {
        maxShares = balanceOf(owner);
    }
    function previewRedeem(uint256 shares) override public view returns (uint256 assets) {
        assets = convertToAssets(shares);
    }

    /* PUBLIC -> ACTIONS */

    /* PUBLIC -> ACTIONS -> EIP4626 */
    function deposit(uint256 assets, address receiver) override external returns (uint256 shares) {
        shares = _deposit(assets, receiver);
    }
    
    function mint(uint256 shares, address receiver) override external returns (uint256 assets) {
        assets = _mintShares(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner) override external returns (uint256 shares) {
        shares = _withdraw(assets, receiver, owner);
    }
    
    function redeem(uint256 shares, address receiver, address owner) override external returns (uint256 assets) {
        assets = _redeem(shares, receiver, owner);
    }

    /* PRIVATE */

    /* PRIVATE -> GETTERS */
    function _getUnderlying() private view returns (IERC20Metadata) {
        return getRegistryModule()
            .getRegistryAddresses()
            .accountingModule
            .getUnderlying();
    }

    /* PRIVATE -> ACTIONS */
    /* PRIVATE -> ACTIONS -> EIP4626 */
    function _deposit(uint256 assets_, address receiver_) private canDeposit nonReentrant returns (uint256 shares) {
        // Check for rounding error since we round down in previewDeposit
        require((shares = previewDeposit(assets_)) != 0, "S3");
        // Transfer tokens in
        _getUnderlying().safeTransferFrom(msg.sender, address(_executor), assets_);
        // Trigger Accounting Module
        getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(assets_, true);
        // Mint shares
        _mint(receiver_, shares);

        emit Deposit(msg.sender, receiver_, assets_, shares);
    }

    function _mintShares(uint256 shares_, address receiver_) private canDeposit nonReentrant returns (uint256 assets) {
        // No need to check for rounding error, previewMint rounds up
        assets = previewMint(shares_);
        // Transfer tokens in
        _getUnderlying().safeTransferFrom(msg.sender, address(_executor), assets);
        // Trigger Accounting Module
        getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(assets, true);
        // Mint shares
        _mint(receiver_, shares_);

        emit Deposit(msg.sender, receiver_, assets, shares_);
    }

    function _withdraw(uint256 assets_, address receiver_, address owner_) private canWithdraw nonReentrant returns (uint256 shares) {
        // No need to check for rounding error, previewWithdraw rounds up
        shares = previewWithdraw(assets_);
        // If sender is not owner of the shares, decrease allowance
        // If allowance is less than shares, will revert with overflow
        if (msg.sender != owner_) {
            uint256 allowed = allowance(owner_, msg.sender); // Saves gas for limited approvals
            if (allowed != type(uint256).max) {
                _approve(owner_, msg.sender, allowed - shares);
            }
        }
        // Burn shares
        _burn(msg.sender, shares);
        // Trigger Accounting Module
        getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(assets_, false);

        emit Withdraw(msg.sender, receiver_, owner_, assets_, shares);

        // Transfer tokens out
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), receiver_, assets_);
        _executeCall(address(_getUnderlying()), data);
    }

    function _redeem(uint256 shares_, address receiver_, address owner_) private canWithdraw nonReentrant returns (uint256 assets) {
        // If sender is not owner of the shares, decrease allowance
        // If allowance is less than shares, will revert with overflow
        if (msg.sender != owner_) {
            uint256 allowed = allowance(owner_, msg.sender); // Saves gas for limited approvals
            if (allowed != type(uint256).max) {
                _approve(owner_, msg.sender, allowed - shares_);
            }
        }
        // Check for rounding error since we round down in previewRedeem
        require((assets = previewRedeem(shares_)) != 0, "S4");
        // Burn shares
        _burn(owner_, shares_);
        // Trigger Accounting Module
        getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(assets, false);

        emit Withdraw(msg.sender, receiver_, owner_, assets, shares_);

        // Transfer tokens out
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), receiver_, assets);
        _executeCall(address(_getUnderlying()), data);
    }
}
