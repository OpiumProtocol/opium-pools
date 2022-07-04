import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import {
  deployGnosisSafeSingleton,
  deployGnosisSafeFactory,
  deployGnosisSafe,
  enableModule,
  setupRegistry,
  enableStrategyInRegistry,
  sendArbitraryTx,
} from "../mixins";

import {
  AccountingModule,
  RegistryModule,
  MockToken,
  GnosisSafeL2,
  LifecycleModule,
  StakingModule,
} from "../../typechain";

import {
  getCurrentTimestamp,
  timeTravel,
  takeSnapshot,
  restoreSnapshot,
} from "../utils";

// Lifecycle module params
const EPOCH_LENGTH = 3600 * 24 * 7; // 1 week
const STAKING_LENGTH = 3600 * 4; // 4 hours
const TRADING_LENGTH = 3600 * 24 * 2; // 2 days

// Accounting module params
const YEAR_SECONDS = 360 * 24 * 3600; // 1 year in seconds
const BASE = ethers.utils.parseEther("1");
const PROFIT_FEE = ethers.utils.parseEther("0.1");
const ANNUAL_MAINTENANCE_FEE = ethers.utils.parseEther("0.02");

// Contacts for tests
const DEPOSIT_AMOUNT = ethers.utils.parseEther("200");
const WITHDRAWAL_AMOUNT = ethers.utils.parseEther("100");
const UTILIZED_AMOUNT = ethers.utils.parseEther("20");
const PREMIUM_AMOUNT = ethers.utils.parseEther("20");

const SMALL_DEPOSIT_AMOUNT = DEPOSIT_AMOUNT.div(2);
const SMALL_WITHDRAWAL_AMOUNT = WITHDRAWAL_AMOUNT.div(2);
const TOTAL_DEPOSITED_AMOUNT = DEPOSIT_AMOUNT.sub(WITHDRAWAL_AMOUNT);
const FINAL_DEPOSITED_AMOUNT = TOTAL_DEPOSITED_AMOUNT.add(SMALL_DEPOSIT_AMOUNT);

const PROFIT_FEE_AMOUNT = PREMIUM_AMOUNT.mul(PROFIT_FEE).div(BASE);
const MAINTENANCE_FEE_AMOUNT = FINAL_DEPOSITED_AMOUNT.mul(
  ANNUAL_MAINTENANCE_FEE
)
  .mul(EPOCH_LENGTH)
  .div(YEAR_SECONDS)
  .div(BASE);

const FINAL_LIQUIDITY_AMOUNT = FINAL_DEPOSITED_AMOUNT.add(PREMIUM_AMOUNT)
  .sub(PROFIT_FEE_AMOUNT)
  .sub(MAINTENANCE_FEE_AMOUNT);

const FINAL_SHARES_RATE = DEPOSIT_AMOUNT.mul(DEPOSIT_AMOUNT).div(
  FINAL_LIQUIDITY_AMOUNT
);
const FINAL_AMOUNT_RATE = DEPOSIT_AMOUNT.mul(FINAL_LIQUIDITY_AMOUNT).div(
  DEPOSIT_AMOUNT
);

describe("StakingModule", function () {
  let accountingModule: AccountingModule;
  let registryModule: RegistryModule;
  let lifecycleModule: LifecycleModule;
  let stakingModule: StakingModule;

  let deployer: SignerWithAddress;
  let strategyModule: SignerWithAddress;

  let gnosisSafe: GnosisSafeL2;

  let mockToken: MockToken;
  let mockPosition: MockToken;

  let currentEpochStart: number;

  let snapshotId: any;

  before(async () => {
    snapshotId = await takeSnapshot();

    [deployer, strategyModule] = await ethers.getSigners();

    // Deploy mocks
    const MockToken = await ethers.getContractFactory("MockToken");
    mockToken = await MockToken.deploy();
    await mockToken.deployed();
    await mockToken.transfer(strategyModule.address, PREMIUM_AMOUNT);

    mockPosition = await MockToken.deploy();
    await mockPosition.deployed();

    // Setup GnosisSafe
    const gnosisSafeSingleton = await deployGnosisSafeSingleton();
    const gnosisSafeProxyFactory = await deployGnosisSafeFactory();
    gnosisSafe = await deployGnosisSafe(
      gnosisSafeSingleton,
      gnosisSafeProxyFactory,
      deployer
    );

    // Deploy Registry Module
    const RegistryModule = await ethers.getContractFactory("RegistryModule");
    registryModule = <RegistryModule>(
      await upgrades.deployProxy(RegistryModule, [gnosisSafe.address])
    );
    await registryModule.deployed();

    // Deploy Accounting Module
    const AccountingModule = await ethers.getContractFactory(
      "AccountingModule"
    );
    accountingModule = <AccountingModule>(
      await upgrades.deployProxy(AccountingModule, [
        mockToken.address,
        registryModule.address,
        gnosisSafe.address,
      ])
    );
    await accountingModule.deployed();

    // Deploy Lifecycle Module
    const now = await getCurrentTimestamp();
    currentEpochStart = now - STAKING_LENGTH / 2;

    const LifecycleModule = await ethers.getContractFactory("LifecycleModule");
    lifecycleModule = <LifecycleModule>(
      await upgrades.deployProxy(LifecycleModule, [
        currentEpochStart,
        [EPOCH_LENGTH, STAKING_LENGTH, TRADING_LENGTH],
        registryModule.address,
        deployer.address,
      ])
    );
    await lifecycleModule.deployed();

    // Deploy Staking Module
    const StakingModule = await ethers.getContractFactory("StakingModule");
    stakingModule = <StakingModule>(
      await upgrades.deployProxy(StakingModule, [
        "LP Token",
        "LPT",
        registryModule.address,
        gnosisSafe.address,
      ])
    );
    await stakingModule.deployed();

    // Additional setup
    await setupRegistry(
      gnosisSafe,
      registryModule,
      accountingModule,
      lifecycleModule,
      stakingModule,
      deployer
    );
    await enableStrategyInRegistry(
      gnosisSafe,
      registryModule,
      strategyModule.address,
      deployer
    );
    await enableModule(gnosisSafe, stakingModule.address, deployer);
    await enableModule(gnosisSafe, accountingModule.address, deployer);
  });

  after(async () => {
    await restoreSnapshot(snapshotId);
  });

  it("should correctly return initial values", async function () {
    const decimals = await stakingModule.decimals();
    expect(decimals).to.be.equal(await mockToken.decimals());

    const asset = await stakingModule.asset();
    expect(asset).to.be.equal(mockToken.address);

    const totalAssets = await stakingModule.totalAssets();
    expect(totalAssets).to.be.equal("0");

    const balanceOf = await stakingModule.balanceOf(deployer.address);
    expect(balanceOf).to.be.equal("0");

    const convertToShares = await stakingModule.convertToShares(DEPOSIT_AMOUNT);
    expect(convertToShares).to.be.equal(DEPOSIT_AMOUNT);

    const convertToAssets = await stakingModule.convertToAssets(DEPOSIT_AMOUNT);
    expect(convertToAssets).to.be.equal(DEPOSIT_AMOUNT);

    const maxDeposit = await stakingModule.maxDeposit(deployer.address);
    expect(maxDeposit).to.be.equal(ethers.constants.MaxUint256);

    const previewDeposit = await stakingModule.previewDeposit(DEPOSIT_AMOUNT);
    expect(previewDeposit).to.be.equal(DEPOSIT_AMOUNT);

    const maxMint = await stakingModule.maxMint(deployer.address);
    expect(maxMint).to.be.equal(ethers.constants.MaxUint256);

    const previewMint = await stakingModule.previewMint(DEPOSIT_AMOUNT);
    expect(previewMint).to.be.equal(DEPOSIT_AMOUNT);

    const maxWithdraw = await stakingModule.maxWithdraw(deployer.address);
    expect(maxWithdraw).to.be.equal("0");

    const previewWithdraw = await stakingModule.previewWithdraw(DEPOSIT_AMOUNT);
    expect(previewWithdraw).to.be.equal(DEPOSIT_AMOUNT);

    const maxRedeem = await stakingModule.maxRedeem(deployer.address);
    expect(maxRedeem).to.be.equal("0");

    const previewRedeem = await stakingModule.previewRedeem(DEPOSIT_AMOUNT);
    expect(previewRedeem).to.be.equal(DEPOSIT_AMOUNT);
  });

  it("should correctly deposit and mint", async () => {
    // Approve tokens for deposit
    await mockToken.approve(stakingModule.address, DEPOSIT_AMOUNT);

    // Deposit half
    await stakingModule.deposit(SMALL_DEPOSIT_AMOUNT, deployer.address);

    const totalAssetsAfterOne = await stakingModule.totalAssets();
    expect(totalAssetsAfterOne).to.be.equal(SMALL_DEPOSIT_AMOUNT);

    const balanceOfAfterOne = await stakingModule.balanceOf(deployer.address);
    expect(balanceOfAfterOne).to.be.equal(SMALL_DEPOSIT_AMOUNT);

    // Mint second half
    await stakingModule.mint(SMALL_DEPOSIT_AMOUNT, deployer.address);

    const totalAssetsAfterTwo = await stakingModule.totalAssets();
    expect(totalAssetsAfterTwo).to.be.equal(DEPOSIT_AMOUNT);

    const balanceOfAfterTwo = await stakingModule.balanceOf(deployer.address);
    expect(balanceOfAfterTwo).to.be.equal(DEPOSIT_AMOUNT);
  });

  it("should correctly withdraw and redeem", async () => {
    const maxWithdrawBefore = await stakingModule.maxWithdraw(deployer.address);
    expect(maxWithdrawBefore).to.be.equal(DEPOSIT_AMOUNT);

    const maxRedeemBefore = await stakingModule.maxRedeem(deployer.address);
    expect(maxRedeemBefore).to.be.equal(DEPOSIT_AMOUNT);

    // Withdraw half
    await stakingModule.withdraw(
      SMALL_WITHDRAWAL_AMOUNT,
      deployer.address,
      deployer.address
    );

    const maxWithdrawAfterOne = await stakingModule.maxWithdraw(
      deployer.address
    );
    expect(maxWithdrawAfterOne).to.be.equal(
      DEPOSIT_AMOUNT.sub(SMALL_WITHDRAWAL_AMOUNT)
    );

    const maxRedeemAfterOne = await stakingModule.maxRedeem(deployer.address);
    expect(maxRedeemAfterOne).to.be.equal(
      DEPOSIT_AMOUNT.sub(SMALL_WITHDRAWAL_AMOUNT)
    );

    const totalAssetsAfterOne = await stakingModule.totalAssets();
    expect(totalAssetsAfterOne).to.be.equal(
      DEPOSIT_AMOUNT.sub(SMALL_WITHDRAWAL_AMOUNT)
    );

    const balanceOfAfterOne = await stakingModule.balanceOf(deployer.address);
    expect(balanceOfAfterOne).to.be.equal(
      DEPOSIT_AMOUNT.sub(SMALL_WITHDRAWAL_AMOUNT)
    );

    // Redeem second half
    await stakingModule.redeem(
      SMALL_WITHDRAWAL_AMOUNT,
      deployer.address,
      deployer.address
    );

    const maxWithdrawAfterTwo = await stakingModule.maxWithdraw(
      deployer.address
    );
    expect(maxWithdrawAfterTwo).to.be.equal(TOTAL_DEPOSITED_AMOUNT);

    const maxRedeemAfterTwo = await stakingModule.maxRedeem(deployer.address);
    expect(maxRedeemAfterTwo).to.be.equal(TOTAL_DEPOSITED_AMOUNT);

    const totalAssetsAfterTwo = await stakingModule.totalAssets();
    expect(totalAssetsAfterTwo).to.be.equal(TOTAL_DEPOSITED_AMOUNT);

    const balanceOfAfterTwo = await stakingModule.balanceOf(deployer.address);
    expect(balanceOfAfterTwo).to.be.equal(TOTAL_DEPOSITED_AMOUNT);
  });

  it("should correctly behave during trading phase", async () => {
    await timeTravel(STAKING_LENGTH);

    // Expect withdrawals to be reverted
    await expect(
      stakingModule.withdraw(
        SMALL_WITHDRAWAL_AMOUNT,
        deployer.address,
        deployer.address
      )
    ).revertedWith("S2");

    // Expect deposits to work
    await mockToken.approve(stakingModule.address, SMALL_DEPOSIT_AMOUNT);
    await stakingModule.deposit(SMALL_DEPOSIT_AMOUNT, deployer.address);

    const totalAssets = await stakingModule.totalAssets();
    expect(totalAssets).to.be.equal(
      TOTAL_DEPOSITED_AMOUNT.add(SMALL_DEPOSIT_AMOUNT)
    );

    const balanceOf = await stakingModule.balanceOf(deployer.address);
    expect(balanceOf).to.be.equal(
      TOTAL_DEPOSITED_AMOUNT.add(SMALL_DEPOSIT_AMOUNT)
    );

    // Utilize funds
    await sendArbitraryTx(
      gnosisSafe,
      mockToken.address,
      mockToken.interface.encodeFunctionData("transfer", [
        strategyModule.address,
        UTILIZED_AMOUNT,
      ]),
      deployer
    );
    await mockToken
      .connect(strategyModule)
      .transfer(gnosisSafe.address, PREMIUM_AMOUNT);

    await accountingModule
      .connect(strategyModule)
      .changeHoldingPosition(mockPosition.address, true);

    // Check that utilization doesn't change shares ratio calculation
    const convertToShares = await stakingModule.convertToShares(DEPOSIT_AMOUNT);
    expect(convertToShares).to.be.equal(DEPOSIT_AMOUNT);

    const convertToAssets = await stakingModule.convertToAssets(DEPOSIT_AMOUNT);
    expect(convertToAssets).to.be.equal(DEPOSIT_AMOUNT);
  });

  it("should correctly behave during idle phase", async () => {
    await timeTravel(TRADING_LENGTH);

    // Expect deposits to be reverted
    await expect(
      stakingModule.deposit(SMALL_DEPOSIT_AMOUNT, deployer.address)
    ).revertedWith("S1");

    // Expect withdrawals to be reverted
    await expect(
      stakingModule.withdraw(
        SMALL_WITHDRAWAL_AMOUNT,
        deployer.address,
        deployer.address
      )
    ).revertedWith("S2");
  });

  it("should correctly behave next staking phase", async () => {
    const now = await getCurrentTimestamp();
    const travel = currentEpochStart + EPOCH_LENGTH - now + STAKING_LENGTH / 2;
    await timeTravel(travel);

    // Return utilized liquidity and rebalance
    await mockToken
      .connect(strategyModule)
      .transfer(gnosisSafe.address, UTILIZED_AMOUNT);

    await accountingModule
      .connect(strategyModule)
      .changeHoldingPosition(mockPosition.address, false);

    await accountingModule.connect(strategyModule).rebalance();

    // Check that profit changed shares ratio calculation
    const convertToShares = await stakingModule.convertToShares(DEPOSIT_AMOUNT);
    expect(convertToShares).to.be.equal(FINAL_SHARES_RATE);

    const convertToAssets = await stakingModule.convertToAssets(DEPOSIT_AMOUNT);
    expect(convertToAssets).to.be.equal(FINAL_AMOUNT_RATE);
  });
});
