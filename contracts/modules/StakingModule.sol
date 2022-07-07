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

    Additionally it allows to schedule deposits and withdrawals if direct ones are not available

    Another Staking Module's feature is Rage Quit, which allows LP token holders to exit the pool any time regardless of the current phase and receive all pools assets in pro-rata basis

    Error codes:
        - S1 = can't deposit
        - S2 = can't withdraw
        - S3 = zero shares on deposit
        - S4 = zero assets on redemption
        - S5 = only LifecycleModule allowed
        - S6 = provided position is not present in an accounting module
        - S7 = tokens[] is out of order or contains a duplicate
        - S8 = nothing was scheduled in the current epoch ID (number)
        - S9 = given amount exceeds available
 */
contract StakingModule is IStakingModule, IEIP4626, ERC165Upgradeable, ERC20PermitUpgradeable, RegistryManager {
    using SafeERC20Upgradeable for IERC20MetadataUpgradeable;
    using FixedPointMathLib for uint256;
    using Schedulers for Schedulers.ScheduledDeposit;
    using Schedulers for Schedulers.ScheduledWithdrawal;

    /// @notice Holds state of the scheduled deposits by user address
    mapping(address => Schedulers.ScheduledDeposit) public scheduledDeposits;
    /// @notice Holds state of the scheduled withdrawals by user address
    mapping(address => Schedulers.ScheduledWithdrawal) public scheduledWithdrawals;
    /// @notice Holds share price by epoch ID (number)
    mapping(uint16 => uint256) public sharePriceByEpoch;
    /// @notice Holds the total amount of scheduled deposits in the current epoch
    uint256 public totalScheduledDeposits;
    /// @notice Holds the total amount of scheduled withdrawals in the current epoch
    uint256 public totalScheduledWithdrawals;

    /// @notice Initializer of the Staking Module
    /// @param name_ name of the LP token
    /// @param symbol_ symbol of the LP token
    /// @param registryModule_ instance of a Registry Module to connect to
    /// @param owner_ address of the contract owner
    function initialize(
        string memory name_,
        string memory symbol_,
        IRegistryAndZodiacModule registryModule_,
        address owner_
    )
        external initializer
    {
        // Initialize ERC20PermitUpgradeable
        __ERC20Permit_init(name_);
        // Initialize ERC20Upgradeable
        __ERC20_init(name_, symbol_);
        // Initialize Registry Manager
        __RegistryManager_init(registryModule_, owner_);
    }

    /* MODIFIERS */

    /// @notice Restricts access to function to be callable only when Deposits are available
    modifier onlyIfCanDeposit() {
        require(
            canDeposit(),
            "S1"
        );
        _;
    }

    /// @notice Restricts access to function to be callable only when Withdrawals are available
    modifier onlyIfCanWithdraw() {
        require(
            canWithdraw(),
            "S2"
        );
        _;
    }

    /* PUBLIC */

    /* PUBLIC -> GETTERS */

    /// @notice Indicates whether deposits are available at the moment
    function canDeposit() override public view returns (bool) {
        return getRegistryModule()
            .getRegistryAddresses()
            .lifecycleModule
            .canDeposit();
    }

    /// @notice Indicates whether withdrawals are available at the moment
    function canWithdraw() override public view returns (bool) {
        return getRegistryModule()
            .getRegistryAddresses()
            .lifecycleModule
            .canWithdraw();
    }

    /// @notice See {ERC20Upgradable-decimals}
    /// @dev Overrides ERC20.decimals to match underlying token's decimals
    function decimals() override public view returns (uint8) {
        return _getUnderlying().decimals();
    }

    /// @notice See {ERC165Upgradable-supportsInterface}
    /// @dev Overrides ERC165.supportsInterface
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IEIP4626).interfaceId || super.supportsInterface(interfaceId);
    }

    /* PUBLIC -> GETTERS -> EIP4626 */
    /// @notice The address of the underlying token used for the Vault for accounting, depositing, and withdrawing
    function asset() override external view returns (address assetTokenAddress) {
        assetTokenAddress = address(_getUnderlying());
    }

    /// @notice Total amount of the underlying asset that is “managed” by Vault
    function totalAssets() override public view returns (uint256 totalManagedAssets) {
        totalManagedAssets = getRegistryModule()
            .getRegistryAddresses()
            .accountingModule
            .getTotalLiquidity();
    }

    /// @notice The amount of shares that the Vault would exchange for the amount of assets provided
    /// @param assets amount of provided assets
    function convertToShares(uint256 assets) override public view returns (uint256 shares) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        shares = supply == 0 ? assets : assets.mulDivDown(supply, totalAssets());
    }

    /// @notice The amount of assets that the Vault would exchange for the amount of shares provided
    /// @param shares amount of provided shares
    function convertToAssets(uint256 shares) override public view returns (uint256 assets) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        assets = supply == 0 ? shares : shares.mulDivDown(totalAssets(), supply);
    }

    /// @notice Maximum amount of the underlying asset that can be deposited into the Vault for the receiver, through a deposit call
    function maxDeposit(address) override external pure returns (uint256 maxAssets) {
        maxAssets = type(uint256).max;
    }

    /// @notice Allows an on-chain or off-chain user to simulate the effects of their deposit at the current block, given current on-chain conditions
    /// @param assets amount of provided assets
    function previewDeposit(uint256 assets) override public view returns (uint256 shares) {
        shares = convertToShares(assets);
    }

    /// @notice Maximum amount of shares that can be minted from the Vault for the receiver, through a mint call
    function maxMint(address) override external pure returns (uint256 maxShares) {
        maxShares = type(uint256).max;
    }

    /// @notice Allows an on-chain or off-chain user to simulate the effects of their mint at the current block, given current on-chain conditions
    /// @param shares amount of provided shares
    function previewMint(uint256 shares) override public view returns (uint256 assets) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        assets = supply == 0 ? shares : shares.mulDivUp(totalAssets(), supply);
    }

    /// @notice Maximum amount of the underlying asset that can be withdrawn from the owner balance in the Vault, through a withdraw call
    /// @param owner address of the LP holder
    function maxWithdraw(address owner) override external view returns (uint256 maxAssets) {
        maxAssets = convertToAssets(balanceOf(owner));
    }

    /// @notice Allows an on-chain or off-chain user to simulate the effects of their withdrawal at the current block, given current on-chain conditions
    /// @param assets amount of provided assets
    function previewWithdraw(uint256 assets) override public view returns (uint256 shares) {
        uint256 supply = totalSupply(); // Saves an extra SLOAD if totalSupply is non-zero.
        shares = supply == 0 ? assets : assets.mulDivUp(supply, totalAssets());
    }

    /// @notice Maximum amount of Vault shares that can be redeemed from the owner balance in the Vault, through a redeem call
    /// @param owner address of the LP holder
    function maxRedeem(address owner) override external view returns (uint256 maxShares) {
        maxShares = balanceOf(owner);
    }

    /// @notice Allows an on-chain or off-chain user to simulate the effects of their redeemption at the current block, given current on-chain conditions
    /// @param shares amount of provided shares
    function previewRedeem(uint256 shares) override public view returns (uint256 assets) {
        assets = convertToAssets(shares);
    }
    
    /// @notice Calculates `receiver`s scheduled shares that are available to claim
    /// @param receiver address of the LP holder
    function getScheduledShares(address receiver) override external view returns (uint256 scheduledShares) {
        // Get the receivers scheduled deposit instance
        Schedulers.ScheduledDeposit memory scheduledDeposit = scheduledDeposits[receiver];
        // Calculate the outstanding scheduled shares
        scheduledShares = scheduledDeposit.processScheduledShares(sharePriceByEpoch, _getEpochId());
    }

    /// @notice Calculates `receiver`s scheduled assets that are available to claim
    /// @param receiver address of the LP holder
    function getScheduledAssets(address receiver) override external view returns (uint256 scheduledAssets) {
        // Get the receivers scheduled withdrawal instance
        Schedulers.ScheduledWithdrawal memory scheduledWithdrawal = scheduledWithdrawals[receiver];
        // Calculate the outstanding scheduled assets
        scheduledAssets = scheduledWithdrawal.processScheduledAssets(sharePriceByEpoch, _getEpochId());
    }

    /* PUBLIC -> ACTIONS */

    /// @notice Mints Vault shares to receiver by depositing exactly amount of underlying tokens
    /// @param assets amount of assets to deposit
    /// @param receiver address of the shares receiver
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

    /// @notice Performs deposit with a referral link
    /// @dev see {this.deposit}
    /// @param referralId unique id of the referral
    function depositRef(uint256 assets, address receiver, uint256 referralId) override external returns (uint256 shares) {
        shares = deposit(assets, receiver);
        emit Referral(referralId);
    }
    
    /// @notice Mints exactly shares Vault shares to receiver by depositing amount of underlying tokens
    /// @param assets amount of shares to mint
    /// @param receiver address of the shares receiver
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

    /// @notice Performs mint with a referral link
    /// @dev see {this.mint}
    /// @param referralId unique id of the referral
    function mintRef(uint256 shares, address receiver, uint256 referralId) override public returns (uint256 assets) {
        assets = mint(shares, receiver);
        emit Referral(referralId);
    }

    /// @notice Burns shares from owner and sends exactly assets of underlying tokens to receiver
    /// @param assets amount of assets to withdraw
    /// @param receiver address of the assets receiver
    /// @param owner address that owns the shares
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
    
    /// @notice Burns exactly shares from owner and sends assets of underlying tokens to receiver
    /// @param shares amount of shares to burn
    /// @param receiver address of the assets receiver
    /// @param owner address that owns the shares
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

    /// @notice Deposits users funds directly if possible, otherwise schedules the deposit for the next epoch
    /// @dev see {this.deposit}
    function scheduleDeposit(uint256 assets, address receiver) override public nonReentrant returns (uint256 shares) {
        // Check if can deposit directly
        if (canDeposit()) {
            return deposit(assets, receiver);
        }

        // Transfer tokens in
        _getUnderlying().safeTransferFrom(msg.sender, address(this), assets);

        // Get scheduled deposit instance
        Schedulers.ScheduledDeposit memory scheduledDeposit = scheduledDeposits[receiver];

        // Calculate outstanding shares if any
        uint256 scheduledShares = scheduledDeposit.processScheduledShares(sharePriceByEpoch, _getEpochId());

        uint256 depositedAssets = assets;

        // If already has scheduled deposit in current epoch, then add already scheduled deposit
        if (scheduledDeposit.updatedAtEpoch == _getEpochId()) {
            depositedAssets += scheduledDeposit.depositedAssets;
        }

        Schedulers.assertUint120(depositedAssets);
        Schedulers.assertUint120(scheduledShares);

        // Update scheduled deposit
        scheduledDeposits[receiver] = Schedulers.ScheduledDeposit({
            updatedAtEpoch: _getEpochId(),
            depositedAssets: uint120(depositedAssets),
            scheduledShares: uint120(scheduledShares)
        });

        // Update total scheduled deposits with assets
        totalScheduledDeposits += assets;

        emit ScheduledDeposit(msg.sender, receiver, assets);
    }

    /// @notice Performs scheduled deposit with a referral link
    /// @dev see {this.scheduleDeposit}
    /// @param referralId unique id of the referral
    function scheduleDepositRef(uint256 assets, address receiver, uint256 referralId) override external returns (uint256 shares) {
        shares = scheduleDeposit(assets, receiver);
        emit Referral(referralId);
    }

    /// @notice Unschedules the deposit from the next epoch
    /// @param assets amount of assets to unschedule
    function unscheduleDeposit(uint256 assets) override external nonReentrant {
        // Get scheduled deposit instance
        Schedulers.ScheduledDeposit memory scheduledDeposit = scheduledDeposits[msg.sender];

        // Check if scheduled deposits in the current epoch
        require(scheduledDeposit.updatedAtEpoch == _getEpochId(), "S8");

        // Update scheduled deposit with subtracted assets
        scheduledDeposits[msg.sender] = Schedulers.ScheduledDeposit({
            updatedAtEpoch: _getEpochId(),
            depositedAssets: uint120(scheduledDeposit.depositedAssets - assets),
            scheduledShares: scheduledDeposit.scheduledShares
        });

        // Update total scheduled deposits with assets
        totalScheduledDeposits -= assets;

        // Transfer tokens out
        _getUnderlying().safeTransfer(msg.sender, assets);

        emit UnscheduledDeposit(msg.sender, assets);
    }

    /// @notice Claims scheduled shares that were minted for scheduled deposit
    /// @param shares amount of shares to claim
    /// @param claimAll indicates whether all available shares should be claimed
    function claimScheduledShares(uint256 shares, bool claimAll) override external nonReentrant {
        // Get scheduled deposit instance
        Schedulers.ScheduledDeposit memory scheduledDeposit = scheduledDeposits[msg.sender];

        // Calculate the outstanding scheduled shares
        uint256 scheduledShares = scheduledDeposit.processScheduledShares(sharePriceByEpoch, _getEpochId());

        // Check if users wants to claim all shares
        shares = claimAll ? scheduledShares : shares;

        if (shares == 0) {
            return;
        }

        // Check if requested less or equal than available
        require(shares <= scheduledShares, "S9");

        uint256 depositedAssets = scheduledDeposit.depositedAssets;

        // If there is a scheduled deposit on the same epoch, we keep deposited assets untouched
        // Otherwise erase the field for new deposits
        if (scheduledDeposit.updatedAtEpoch < _getEpochId()) {
            depositedAssets = 0;
        }

        Schedulers.assertUint120(depositedAssets);
        Schedulers.assertUint120(scheduledShares);

        // Update scheduled deposit with subtracted shares
        scheduledDeposits[msg.sender] = Schedulers.ScheduledDeposit({
            updatedAtEpoch: _getEpochId(),
            depositedAssets: uint120(depositedAssets),
            scheduledShares: uint120(scheduledShares - shares)
        });

        // Transfer shares out
        _transfer(address(this), msg.sender, shares);

        emit SharesClaimed(msg.sender, shares);
    }

    /// @notice Withdraws users funds directly if possible, otherwise schedules the withdrawal for the next epoch
    /// @dev See {this.withdraw}
    function scheduleWithdrawal(uint256 shares, address receiver, address owner) override external nonReentrant returns (uint256 assets) {
        // Check if can withdraw directly
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

        // Update total scheduled withdrawals with shares
        totalScheduledWithdrawals += shares;

        // Get scheduled withdrawal instance
        Schedulers.ScheduledWithdrawal memory scheduledWithdrawal = scheduledWithdrawals[receiver];

        // Calculate outstanding assets if any
        uint256 scheduledAssets = scheduledWithdrawal.processScheduledAssets(sharePriceByEpoch, _getEpochId());

        uint256 withdrawnShares = shares;

        // If already has scheduled withdrawal in current epoch, then add already scheduled withdrawal
        if (scheduledWithdrawal.updatedAtEpoch == _getEpochId()) {
            withdrawnShares += scheduledWithdrawal.withdrawnShares;
        }

        Schedulers.assertUint120(withdrawnShares);
        Schedulers.assertUint120(scheduledAssets);

        // Update scheduled deposit
        scheduledWithdrawals[receiver] = Schedulers.ScheduledWithdrawal({
            updatedAtEpoch: _getEpochId(),
            withdrawnShares: uint120(withdrawnShares),
            scheduledAssets: uint120(scheduledAssets)
        });

        emit ScheduledWithdrawal(msg.sender, receiver, owner, shares);
    }

    /// @notice Unschedules the withdrawal from the next epoch
    /// @param shares amount of shares to unschedule
    function unscheduleWithdrawal(uint256 shares) override external nonReentrant {
        // Get scheduled withdrawal instance
        Schedulers.ScheduledWithdrawal memory scheduledWithdrawal = scheduledWithdrawals[msg.sender];

        // Check if scheduled withdrawals in the current epoch
        require(scheduledWithdrawal.updatedAtEpoch == _getEpochId(), "S8");

        // Update scheduled withdrawal with subtracted shares
        scheduledWithdrawals[msg.sender] = Schedulers.ScheduledWithdrawal({
            updatedAtEpoch: _getEpochId(),
            withdrawnShares: uint120(scheduledWithdrawal.withdrawnShares - shares),
            scheduledAssets: scheduledWithdrawal.scheduledAssets
        });

        // Update total scheduled withdrawals with shares
        totalScheduledWithdrawals -= shares;

        // Transfer shares out
        _transfer(address(this), msg.sender, shares);

        emit UnscheduledWithdrawal(msg.sender, shares);
    }

    /// @notice Claims scheduled assets that were allocated for scheduled withdrawal
    /// @param assets amount of assets to claim
    /// @param claimAll indicates whether all available assets should be claimed
    function claimScheduledAssets(uint256 assets, bool claimAll) override external nonReentrant {
        // Get scheduled withdrawal instance
        Schedulers.ScheduledWithdrawal memory scheduledWithdrawal = scheduledWithdrawals[msg.sender];

        // Calculate outstanding assets if any
        uint256 scheduledAssets = scheduledWithdrawal.processScheduledAssets(sharePriceByEpoch, _getEpochId());

        // Check if users wants to claim all assets
        assets = claimAll ? scheduledAssets : assets;

        if (assets == 0) {
            return;
        }

        // Check if requested less or equal than available
        require(assets <= scheduledAssets, "S9");

        uint256 withdrawnShares = scheduledWithdrawal.withdrawnShares;
        
        // If there is a scheduled withdrawal on the same epoch, we keep withdrawn shares untouched
        // Otherwise erase the field for new withdrawals
        if (scheduledWithdrawal.updatedAtEpoch < _getEpochId()) {
            withdrawnShares = 0;
        }

        Schedulers.assertUint120(withdrawnShares);
        Schedulers.assertUint120(scheduledAssets);

        // Update scheduled withdrawal with subtracted assets
        scheduledWithdrawals[msg.sender] = Schedulers.ScheduledWithdrawal({
            updatedAtEpoch: _getEpochId(),
            withdrawnShares: uint120(withdrawnShares),
            scheduledAssets: uint120(scheduledAssets - assets)
        });

        // Transfer tokens out
        _getUnderlying().safeTransfer(msg.sender, assets);

        emit AssetsClaimed(msg.sender, assets);
    }

    /// @notice Allows to burn shares and receive the proportion of the given tokens held by the Vault
    /// @param shares amount of shares to burn
    /// @param receiver address that will receive the tokens
    /// @param owner address that owns the shares
    /// @param tokens array of tokens to receive
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
            // Check if requested token is an underlying or a registered position in Accounting Module
            require(
                (
                    tokens[i] == underlying ||
                    getRegistryModule().getRegistryAddresses().accountingModule.hasPosition(tokens[i])
                ), "S6");
            // Check of there are no duplicates in the tokens array
            require(
                tokens[i] > previousToken,
                "S7"
            );
            // Get the Vault's balance of the requested token 
            vaultTokenBalance = IERC20MetadataUpgradeable(tokens[i]).balanceOf(getRegistryModule().avatar());
            // Calculate users share of the Vault's balance
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
    /// @notice Performs the minting / burning of shares and transfer of assets required to settle the scheduled deposits and withdrawals
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

        // Calculate amount of shares required to mint to perform scheduled deposits
        uint256 sharesToMint = previewDeposit(totalScheduledDeposits);
        // Calculate amount of assets required to transfer to perform scheduled withdrawals
        uint256 assetsToWithdraw = previewRedeem(totalScheduledWithdrawals);

        // If shares to mint exceeds total shares to withdraw, then we only need to mint new shares, otherwise we only need to burn surplus shares
        if (sharesToMint > totalScheduledWithdrawals) {
            _mint(address(this), sharesToMint - totalScheduledWithdrawals);
        } else {
            _burn(address(this), totalScheduledWithdrawals - sharesToMint);
        }

        // If the total scheduled deposits exceeds assets to withdraw, then we only need to transfer assets to the vault, otherwise we need to transfer assets out of the vault
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
    /// @notice Returns and underlying ERC20 asset insance
    function _getUnderlying() private view returns (IERC20MetadataUpgradeable) {
        return getRegistryModule()
            .getRegistryAddresses()
            .accountingModule
            .getUnderlying();
    }

    /// @notice Returns current epoch ID (number)
    function _getEpochId() private view returns (uint16) {
        return ILifecycleModule(
            getRegistryModule()
                .getRegistryAddresses()
                .lifecycleModule
        ).getEpochId();
    }
}
