import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

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
  GnosisSafe,
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

// Contacts for tests
const DEPOSIT_AMOUNT = ethers.utils.parseEther("200");
const WITHDRAWAL_AMOUNT = ethers.utils.parseEther("100");
const UTILIZED_AMOUNT = ethers.utils.parseEther("20");
const UTILIZED_RATIO = ethers.utils.parseEther("0.1");
const PREMIUM_AMOUNT = ethers.utils.parseEther("10");
const FEE_AMOUNT = ethers.utils.parseEther("0.1");

const TOTAL_DEPOSITED_AMOUNT = DEPOSIT_AMOUNT.sub(WITHDRAWAL_AMOUNT);

describe("AccountingModule", function () {
  let accountingModule: AccountingModule;
  let registryModule: RegistryModule;
  let lifecycleModule: LifecycleModule;
  let stakingModule: StakingModule;

  let deployer: SignerWithAddress;
  let feeCollectorSigner: SignerWithAddress;
  let strategyModule: SignerWithAddress;

  let gnosisSafe: GnosisSafe;

  let mockToken: MockToken;
  let mockPosition: MockToken;

  let snapshotId: any;

  before(async () => {
    snapshotId = await takeSnapshot();

    [deployer, feeCollectorSigner, strategyModule] = await ethers.getSigners();

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
    registryModule = await RegistryModule.deploy(gnosisSafe.address);
    await registryModule.deployed();

    // Deploy Accounting Module
    const AccountingModule = await ethers.getContractFactory(
      "AccountingModule"
    );
    accountingModule = await AccountingModule.deploy(
      mockToken.address,
      registryModule.address,
      gnosisSafe.address
    );
    await accountingModule.deployed();

    // Deploy Lifecycle Module
    const now = await getCurrentTimestamp();
    const currentEpochStart = now - STAKING_LENGTH / 2;

    const LifecycleModule = await ethers.getContractFactory("LifecycleModule");
    lifecycleModule = await LifecycleModule.deploy(
      currentEpochStart,
      [EPOCH_LENGTH, STAKING_LENGTH, TRADING_LENGTH],
      registryModule.address,
      deployer.address
    );
    await lifecycleModule.deployed();

    // Deploy Staking Module
    const StakingModule = await ethers.getContractFactory("StakingModule");
    stakingModule = await StakingModule.deploy(
      "LP Token",
      "LPT",
      registryModule.address,
      gnosisSafe.address
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
    const underlying = await accountingModule.getUnderlying();
    expect(underlying).to.be.equal(mockToken.address);

    const totalLiquidity = await accountingModule.getTotalLiquidity();
    expect(totalLiquidity).to.be.equal(0);

    const utilizedLiquidity = await accountingModule.getUtilizedLiquidity();
    expect(utilizedLiquidity).to.be.equal(0);

    const availableLiquidity = await accountingModule.getAvailableLiquidity();
    expect(availableLiquidity).to.be.equal(0);

    const liquidityUtilizationRatio =
      await accountingModule.getLiquidityUtilizationRatio();
    expect(liquidityUtilizationRatio).to.be.equal(0);

    const accumulatedFees = await accountingModule.getAccumulatedFees();
    expect(accumulatedFees).to.be.equal(0);

    const hasPosition = await accountingModule.hasPosition(
      mockPosition.address
    );
    expect(hasPosition).to.be.equal(false);

    const feeCollector = await accountingModule.getFeeCollector();
    expect(feeCollector).to.be.equal(ethers.constants.AddressZero);
  });

  it("should revert on unauthorized access", async function () {
    await expect(
      accountingModule
        .connect(deployer)
        .changeTotalLiquidity(DEPOSIT_AMOUNT, true)
    ).to.be.revertedWith("AM1");

    await expect(
      accountingModule
        .connect(deployer)
        .changeHoldingPosition(mockPosition.address, true)
    ).to.be.revertedWith("AM2");

    await expect(
      accountingModule.connect(deployer).rebalance()
    ).to.be.revertedWith("AM2");

    await expect(
      accountingModule.connect(deployer).collectFees()
    ).to.be.revertedWith("AM4");

    await expect(
      accountingModule
        .connect(feeCollectorSigner)
        .setFeeCollector(feeCollectorSigner.address)
    ).to.be.revertedWith("AM6");
  });

  it("should correctly add / remove liquidity with staking module", async function () {
    await mockToken.approve(stakingModule.address, DEPOSIT_AMOUNT);
    await stakingModule.deposit(DEPOSIT_AMOUNT, deployer.address);

    const totalLiquidityBefore = await accountingModule.getTotalLiquidity();
    expect(totalLiquidityBefore).to.be.equal(DEPOSIT_AMOUNT);

    await stakingModule.withdraw(
      WITHDRAWAL_AMOUNT,
      deployer.address,
      deployer.address
    );

    const totalLiquidityAfter = await accountingModule.getTotalLiquidity();
    expect(totalLiquidityAfter).to.be.equal(TOTAL_DEPOSITED_AMOUNT);

    const availableLiquidity = await accountingModule.getAvailableLiquidity();
    expect(availableLiquidity).to.be.equal(TOTAL_DEPOSITED_AMOUNT);
  });

  it("should correctly utilize liquidity with strategy module", async function () {
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

    const hasPosition = await accountingModule.hasPosition(
      mockPosition.address
    );
    expect(hasPosition).to.be.equal(true);

    const availableLiquidity = await accountingModule.getAvailableLiquidity();
    expect(availableLiquidity).to.be.equal(
      TOTAL_DEPOSITED_AMOUNT.sub(UTILIZED_AMOUNT).add(PREMIUM_AMOUNT)
    );

    const utilizedLiquidity = await accountingModule.getUtilizedLiquidity();
    expect(utilizedLiquidity).to.be.equal(UTILIZED_AMOUNT.sub(PREMIUM_AMOUNT));

    const liquidityUtilizationRatio =
      await accountingModule.getLiquidityUtilizationRatio();
    expect(liquidityUtilizationRatio).to.be.equal(UTILIZED_RATIO);
  });

  it("should correctly return liquidity by the strategy module", async function () {
    await mockToken
      .connect(strategyModule)
      .transfer(gnosisSafe.address, UTILIZED_AMOUNT);

    await accountingModule
      .connect(strategyModule)
      .changeHoldingPosition(mockPosition.address, false);

    const hasPosition = await accountingModule.hasPosition(
      mockPosition.address
    );
    expect(hasPosition).to.be.equal(false);

    const availableLiquidity = await accountingModule.getAvailableLiquidity();
    expect(availableLiquidity).to.be.equal(
      TOTAL_DEPOSITED_AMOUNT.add(PREMIUM_AMOUNT)
    );

    const utilizedLiquidity = await accountingModule.getUtilizedLiquidity();
    expect(utilizedLiquidity).to.be.equal("0");

    const liquidityUtilizationRatio =
      await accountingModule.getLiquidityUtilizationRatio();
    expect(liquidityUtilizationRatio).to.be.equal("0");
  });

  it("should correctly rebalance and progress epoch", async function () {
    await timeTravel(EPOCH_LENGTH);

    await accountingModule.connect(strategyModule).rebalance();

    const totalLiquidity = await accountingModule.getTotalLiquidity();
    expect(totalLiquidity).to.be.equal(
      TOTAL_DEPOSITED_AMOUNT.add(PREMIUM_AMOUNT).sub(FEE_AMOUNT)
    );

    const utilizedLiquidity = await accountingModule.getUtilizedLiquidity();
    expect(utilizedLiquidity).to.be.equal(0);

    const availableLiquidity = await accountingModule.getAvailableLiquidity();
    expect(availableLiquidity).to.be.equal(
      TOTAL_DEPOSITED_AMOUNT.add(PREMIUM_AMOUNT).sub(FEE_AMOUNT)
    );

    const liquidityUtilizationRatio =
      await accountingModule.getLiquidityUtilizationRatio();
    expect(liquidityUtilizationRatio).to.be.equal(0);

    const accumulatedFees = await accountingModule.getAccumulatedFees();
    expect(accumulatedFees).to.be.equal(FEE_AMOUNT);
  });

  it("should correctly set fee collector", async () => {
    await sendArbitraryTx(
      gnosisSafe,
      accountingModule.address,
      accountingModule.interface.encodeFunctionData("setFeeCollector", [
        feeCollectorSigner.address,
      ]),
      deployer
    );

    const feeCollector = await accountingModule.getFeeCollector();
    expect(feeCollector).to.be.equal(feeCollectorSigner.address);
  });

  it("should send fees to fee collector on demand", async () => {
    await accountingModule.connect(feeCollectorSigner).collectFees();

    const feeCollectorBalance = await mockToken.balanceOf(
      feeCollectorSigner.address
    );
    expect(feeCollectorBalance).to.be.equal(FEE_AMOUNT);

    const accumulatedFees = await accountingModule.getAccumulatedFees();
    expect(accumulatedFees).to.be.equal("0");
  });
});
