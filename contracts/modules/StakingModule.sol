// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../base/RegistryManager.sol";

import "../interfaces/IEIP4626.sol";
import "../interfaces/IStakingModule.sol";
import "../interfaces/ILifecycleModule.sol";

import { FixedPointMathLib } from "../utils/FixedPointMathLib.sol";
import { Schedulers } from "../utils/Schedulers.sol";

/**
    @notice Staking Module is an ERC20 tokenized position in the pool that follows EIP4626 standard for liquidity provision

    Error codes:
        - S1 = can't deposit
        - S2 = can't withdraw
        - S3 = zero shares on deposit
        - S4 = zero assets on redemption
        - S5 = only LifecycleModule allowed
        - S6 = provided position is not present in an accounting module
        - S7 = tokens[] is out of order or contains a duplicate
 */
contract StakingModule is IStakingModule, IEIP4626, ERC165Upgradeable, ERC20PermitUpgradeable, RegistryManager {
    using SafeERC20Upgradeable for IERC20MetadataUpgradeable;
    using FixedPointMathLib for uint256;
    using Schedulers for Schedulers.ScheduledDeposit;
    using Schedulers for Schedulers.ScheduledWithdrawal;

    // Staking Module state
    mapping(address => Schedulers.ScheduledDeposit) public scheduledDeposits;
    mapping(address => Schedulers.ScheduledWithdrawal) public scheduledWithdrawals;

    mapping(uint256 => uint256) public sharePriceByEpoch;

    uint256 public totalScheduledDeposits;
    uint256 public totalScheduledWithdrawals;

    function initialize(
        string memory name_,
        string memory symbol_,
        IRegistryAndZodiacModule registryModule_,
        address owner_
    )
        external initializer
    {
        __ERC20Permit_init(name_);
        __ERC20_init(name_, symbol_);
        __RegistryManager_init(registryModule_, owner_);
    }

    /* MODIFIERS */

    modifier onlyIfCanDeposit() {
        require(
            canDeposit(),
            "S1"
        );
        _;
    }

    modifier onlyIfCanWithdraw() {
        require(
            canWithdraw(),
            "S2"
        );
        _;
    }

    /* PUBLIC */

    /* PUBLIC -> GETTERS */

    function canDeposit() override public view returns (bool) {
        return getRegistryModule()
            .getRegistryAddresses()
            .lifecycleModule
            .canDeposit();
    }

    function canWithdraw() override public view returns (bool) {
        return getRegistryModule()
            .getRegistryAddresses()
            .lifecycleModule
            .canWithdraw();
    }

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
    
    function getScheduledShares(address receiver) override external view returns (uint256 scheduledShares) {
        Schedulers.ScheduledDeposit memory scheduledDeposit = scheduledDeposits[receiver];
        scheduledShares = scheduledDeposit.processScheduledShares(sharePriceByEpoch, _getEpochId());
    }

    function getScheduledAssets(address receiver) override external view returns (uint256 scheduledAssets) {
        Schedulers.ScheduledWithdrawal memory scheduledWithdrawal = scheduledWithdrawals[receiver];
        scheduledAssets = scheduledWithdrawal.processScheduledAssets(sharePriceByEpoch, _getEpochId());
    }

    /* PUBLIC -> ACTIONS */

    function deposit(uint256 assets, address receiver) override public onlyIfCanDeposit nonReentrant returns (uint256 shares) {
        // Check for rounding error since we round down in previewDeposit
        require((shares = previewDeposit(assets)) != 0, "S3");
        // Transfer tokens in
        _getUnderlying().safeTransferFrom(msg.sender, getRegistryModule().avatar(), assets);
        // Trigger Accounting Module
        getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(assets, true);
        // Mint shares
        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function depositRef(uint256 assets, address receiver, uint256 referralId) override external returns (uint256 shares) {
        shares = deposit(assets, receiver);
        emit Referral(referralId);
    }
    
    function mint(uint256 shares, address receiver) override public onlyIfCanDeposit nonReentrant returns (uint256 assets) {
        // No need to check for rounding error, previewMint rounds up
        assets = previewMint(shares);
        // Transfer tokens in
        _getUnderlying().safeTransferFrom(msg.sender, getRegistryModule().avatar(), assets);
        // Trigger Accounting Module
        getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(assets, true);
        // Mint shares
        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function mintRef(uint256 shares, address receiver, uint256 referralId) override public returns (uint256 assets) {
        assets = mint(shares, receiver);
        emit Referral(referralId);
    }

    function withdraw(uint256 assets, address receiver, address owner) override external onlyIfCanWithdraw nonReentrant returns (uint256 shares) {
        // No need to check for rounding error, previewWithdraw rounds up
        shares = previewWithdraw(assets);
        // If sender is not owner of the shares, decrease allowance
        // If allowance is less than shares, will revert with overflow
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender); // Saves gas for limited approvals
            if (allowed != type(uint256).max) {
                _approve(owner, msg.sender, allowed - shares);
            }
        }
        // Burn shares
        _burn(owner, shares);
        // Trigger Accounting Module
        getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(assets, false);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);

        // Transfer tokens out
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), receiver, assets);
        getRegistryModule().executeOnVault(address(_getUnderlying()), data);
    }
    
    function redeem(uint256 shares, address receiver, address owner) override public onlyIfCanWithdraw nonReentrant returns (uint256 assets) {
        // If sender is not owner of the shares, decrease allowance
        // If allowance is less than shares, will revert with overflow
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender); // Saves gas for limited approvals
            if (allowed != type(uint256).max) {
                _approve(owner, msg.sender, allowed - shares);
            }
        }
        // Check for rounding error since we round down in previewRedeem
        require((assets = previewRedeem(shares)) != 0, "S4");
        // Burn shares
        _burn(owner, shares);
        // Trigger Accounting Module
        getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(assets, false);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);

        // Transfer tokens out
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), receiver, assets);
        getRegistryModule().executeOnVault(address(_getUnderlying()), data);
    }

    function scheduleDeposit(uint256 assets, address receiver) override public nonReentrant returns (uint256 shares) {
        if (canDeposit()) {
            return deposit(assets, receiver);
        }

        // Transfer tokens in
        _getUnderlying().safeTransferFrom(msg.sender, address(this), assets);

        Schedulers.ScheduledDeposit memory scheduledDeposit = scheduledDeposits[receiver];

        uint256 scheduledShares = scheduledDeposit.processScheduledShares(sharePriceByEpoch, _getEpochId());

        uint256 depositedAssets = assets;

        // If already has scheduled deposit in current epoch, then add already scheduled deposit
        if (scheduledDeposit.updatedAtEpoch == _getEpochId()) {
            depositedAssets += scheduledDeposit.depositedAssets;
        }

        // Update scheduled deposit
        scheduledDeposits[receiver] = Schedulers.ScheduledDeposit({
            updatedAtEpoch: _getEpochId(),
            depositedAssets: depositedAssets,
            scheduledShares: scheduledShares
        });

        totalScheduledDeposits += assets;

        emit ScheduledDeposit(msg.sender, receiver, assets);
    }

    function scheduleDepositRef(uint256 assets, address receiver, uint256 referralId) override external returns (uint256 shares) {
        shares = scheduleDeposit(assets, receiver);
        emit Referral(referralId);
    }

    function unscheduleDeposit(uint256 assets) override external nonReentrant {
        Schedulers.ScheduledDeposit memory scheduledDeposit = scheduledDeposits[msg.sender];
        require(scheduledDeposit.updatedAtEpoch == _getEpochId(), "Nothing scheduled");

        scheduledDeposits[msg.sender] = Schedulers.ScheduledDeposit({
            updatedAtEpoch: _getEpochId(),
            depositedAssets: scheduledDeposit.depositedAssets - assets,
            scheduledShares: scheduledDeposit.scheduledShares
        });

        totalScheduledDeposits -= assets;

        // Transfer tokens out
        _getUnderlying().safeTransfer(msg.sender, assets);

        emit UnscheduledDeposit(msg.sender, assets);
    }

    function claimScheduledShares(uint256 shares, bool claimAll) override external nonReentrant {
        Schedulers.ScheduledDeposit memory scheduledDeposit = scheduledDeposits[msg.sender];

        uint256 scheduledShares = scheduledDeposit.processScheduledShares(sharePriceByEpoch, _getEpochId());

        shares = claimAll ? scheduledShares : shares;
        if (shares == 0) {
            return;
        }
        require(shares <= scheduledShares, "Exceeds available");

        uint256 depositedAssets = scheduledDeposit.depositedAssets;
        // TODO: Change comments
        // If we have a depositReceipt on the same round, BUT we have some unredeemed shares
        // we debit from the unredeemedShares, but leave the amount field intact
        // If the round has past, with no new deposits, we just zero it out for new deposits.
        if (scheduledDeposit.updatedAtEpoch < _getEpochId()) {
            depositedAssets = 0;
        }

        scheduledDeposits[msg.sender] = Schedulers.ScheduledDeposit({
            updatedAtEpoch: _getEpochId(),
            depositedAssets: depositedAssets,
            scheduledShares: scheduledShares - shares
        });

        // Transfer shares out
        _transfer(address(this), msg.sender, shares);

        emit SharesClaimed(msg.sender, shares);
    }

    function scheduleWithdrawal(uint256 shares, address receiver, address owner) override external nonReentrant returns (uint256 assets) {
        if (canWithdraw()) {
            return redeem(shares, receiver, owner);
        }

        // If sender is not owner of the shares, decrease allowance
        // If allowance is less than shares, will revert with overflow
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender); // Saves gas for limited approvals
            if (allowed != type(uint256).max) {
                _approve(owner, msg.sender, allowed - shares);
            }
        }

        // Transfer shares in
        _transfer(owner, address(this), shares);

        totalScheduledWithdrawals += shares;

        Schedulers.ScheduledWithdrawal memory scheduledWithdrawal = scheduledWithdrawals[receiver];

        uint256 scheduledAssets = scheduledWithdrawal.processScheduledAssets(sharePriceByEpoch, _getEpochId());

        uint256 withdrawnShares = shares;

        // If already has scheduled withdrawal in current epoch, then add already scheduled withdrawal
        if (scheduledWithdrawal.updatedAtEpoch == _getEpochId()) {
            withdrawnShares += scheduledWithdrawal.withdrawnShares;
        }

        // Update scheduled deposit
        scheduledWithdrawals[receiver] = Schedulers.ScheduledWithdrawal({
            updatedAtEpoch: _getEpochId(),
            withdrawnShares: withdrawnShares,
            scheduledAssets: scheduledAssets
        });

        emit ScheduledWithdrawal(msg.sender, receiver, owner, shares);
    }

    function unscheduleWithdrawal(uint256 shares) override external nonReentrant {
        Schedulers.ScheduledWithdrawal memory scheduledWithdrawal = scheduledWithdrawals[msg.sender];
        require(scheduledWithdrawal.updatedAtEpoch == _getEpochId(), "Nothing scheduled");

        scheduledWithdrawals[msg.sender] = Schedulers.ScheduledWithdrawal({
            updatedAtEpoch: _getEpochId(),
            withdrawnShares: scheduledWithdrawal.withdrawnShares - shares,
            scheduledAssets: scheduledWithdrawal.scheduledAssets
        });

        totalScheduledWithdrawals -= shares;

        // Transfer shares out
        _transfer(address(this), msg.sender, shares);

        emit UnscheduledWithdrawal(msg.sender, shares);
    }

    function claimScheduledAssets(uint256 assets, bool claimAll) override external nonReentrant {
        Schedulers.ScheduledWithdrawal memory scheduledWithdrawal = scheduledWithdrawals[msg.sender];

        uint256 scheduledAssets = scheduledWithdrawal.processScheduledAssets(sharePriceByEpoch, _getEpochId());

        assets = claimAll ? scheduledAssets : assets;
        if (assets == 0) {
            return;
        }
        require(assets <= scheduledAssets, "Exceeds available");

        uint256 withdrawnShares = scheduledWithdrawal.withdrawnShares;
        // TODO: Change comments
        // If we have a depositReceipt on the same round, BUT we have some unredeemed shares
        // we debit from the unredeemedShares, but leave the amount field intact
        // If the round has past, with no new deposits, we just zero it out for new deposits.
        if (scheduledWithdrawal.updatedAtEpoch < _getEpochId()) {
            withdrawnShares = 0;
        }

        scheduledWithdrawals[msg.sender] = Schedulers.ScheduledWithdrawal({
            updatedAtEpoch: _getEpochId(),
            withdrawnShares: withdrawnShares,
            scheduledAssets: scheduledAssets - assets
        });

        // Transfer tokens out
        _getUnderlying().safeTransfer(msg.sender, assets);

        emit AssetsClaimed(msg.sender, assets);
    }

    function rageQuit(uint256 shares, address receiver, address owner, address[] calldata tokens) override external nonReentrant {
        // If sender is not owner of the shares, decrease allowance
        // If allowance is less than shares, will revert with overflow
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender); // Saves gas for limited approvals
            if (allowed != type(uint256).max) {
                _approve(owner, msg.sender, allowed - shares);
            }
        }

        // Calculate underlying liquidity that represented shares at the beginning of the epoch
        uint256 underlingLiquidity = previewRedeem(shares);
        // Cache total supply before burning
        uint256 cachedTotalSupply = totalSupply();

        // Burn shares
        _burn(owner, shares);

        // Trigger Accounting Module
        getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(underlingLiquidity, false);

        address underlying = address(_getUnderlying());
        address previousToken;
        uint256 vaultTokenBalance;
        uint256 transferAmount;
        for (uint8 i = 0; i < tokens.length; i++) {
            require(
                (
                    tokens[i] == underlying ||
                    getRegistryModule().getRegistryAddresses().accountingModule.hasPosition(tokens[i])
                ), "SM6");
            require(
                tokens[i] > previousToken,
                "SM7"
            );
            vaultTokenBalance = IERC20MetadataUpgradeable(tokens[i]).balanceOf(getRegistryModule().avatar());
            transferAmount = vaultTokenBalance * shares / cachedTotalSupply;

            // Transfer tokens from vault
            bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), receiver, transferAmount);
            getRegistryModule().executeOnVault(tokens[i], data);

            // Write current token as previous
            previousToken = tokens[i];
        }

        emit RageQuit(msg.sender, receiver, owner, shares);
    }

    /* PRIVATE */

    function postRebalancing() override external {
        // Only Lifecycle Module
        require(
            msg.sender == address(
                getRegistryModule()
                    .getRegistryAddresses()
                    .lifecycleModule
            ),
            "S5"
        );

        // Write new price
        sharePriceByEpoch[_getEpochId() - 1] = convertToShares(Schedulers.BASE);

        uint256 sharesToMint = previewDeposit(totalScheduledDeposits);
        uint256 assetsToWithdraw = previewRedeem(totalScheduledWithdrawals);

        if (sharesToMint > totalScheduledWithdrawals) {
            _mint(address(this), sharesToMint - totalScheduledWithdrawals);
        } else {
            _burn(address(this), totalScheduledWithdrawals - sharesToMint);
        }

        if (totalScheduledDeposits > assetsToWithdraw) {
            // Transfer tokens to vault
            _getUnderlying().safeTransfer(getRegistryModule().avatar(), totalScheduledDeposits - assetsToWithdraw);
            // Trigger Accounting Module
            getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(totalScheduledDeposits - assetsToWithdraw, true);
        } else {
            // Transfer tokens from vault
            bytes memory data = abi.encodeWithSelector(bytes4(keccak256(bytes("transfer(address,uint256)"))), address(this), assetsToWithdraw - totalScheduledDeposits);
            getRegistryModule().executeOnVault(address(_getUnderlying()), data);
            // Trigger Accounting Module
            getRegistryModule().getRegistryAddresses().accountingModule.changeTotalLiquidity(assetsToWithdraw - totalScheduledDeposits, false);
        }

        // Clear total scheduled deposits and withdrawals
        totalScheduledDeposits = 0;
        totalScheduledWithdrawals = 0;
    }

    /* PRIVATE -> GETTERS */
    function _getUnderlying() private view returns (IERC20MetadataUpgradeable) {
        return getRegistryModule()
            .getRegistryAddresses()
            .accountingModule
            .getUnderlying();
    }

    function _getEpochId() private view returns (uint256) {
        return ILifecycleModule(
            getRegistryModule()
                .getRegistryAddresses()
                .lifecycleModule
        ).getEpochId();
    }
}
