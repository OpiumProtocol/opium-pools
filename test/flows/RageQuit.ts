import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import {
  deployGnosisSafeSingleton,
  deployGnosisSafeFactory,
  deployGnosisSafe,
  deployRegistryModuleSingleton,
  deployModuleProxyFactory,
  deployRegistryModule,
  enableModule,
  setupRegistry,
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

// Contacts for tests
const DEPOSIT_AMOUNT = ethers.utils.parseEther("200");
const UTILIZE_AMOUNT = ethers.utils.parseEther("150");
const POSITION_ONE_AMOUNT = ethers.utils.parseEther("20");
const POSITION_TWO_AMOUNT = ethers.utils.parseEther("50");

const RAGE_QUIT_PERCENTAGE = ethers.utils.parseEther("1");
const BASE_PERCENTAGE = ethers.utils.parseEther("10");

const POOL_HOLDINGS = DEPOSIT_AMOUNT.sub(UTILIZE_AMOUNT);

describe("RageQuit", function () {
  let accountingModule: AccountingModule;
  let registryModule: RegistryModule;
  let lifecycleModule: LifecycleModule;
  let stakingModule: StakingModule;

  let deployer: SignerWithAddress;
  let depositor: SignerWithAddress;
  let strategyModule: SignerWithAddress;

  let gnosisSafe: GnosisSafeL2;

  let mockToken: MockToken;
  let mockPositionOne: MockToken;
  let mockPositionTwo: MockToken;

  let snapshotId: any;

  before(async () => {
    snapshotId = await takeSnapshot();

    [deployer, depositor, strategyModule] = await ethers.getSigners();

    // Deploy mocks
    const MockToken = await ethers.getContractFactory("MockToken");
    mockToken = await MockToken.deploy();
    await mockToken.deployed();
    await mockToken.transfer(depositor.address, DEPOSIT_AMOUNT);

    mockPositionOne = await MockToken.deploy();
    await mockPositionOne.deployed();
    await mockPositionOne.transfer(strategyModule.address, POSITION_ONE_AMOUNT);

    mockPositionTwo = await MockToken.deploy();
    await mockPositionTwo.deployed();
    await mockPositionTwo.transfer(strategyModule.address, POSITION_TWO_AMOUNT);

    // Setup GnosisSafe
    const gnosisSafeSingleton = await deployGnosisSafeSingleton();
    const gnosisSafeProxyFactory = await deployGnosisSafeFactory();
    gnosisSafe = await deployGnosisSafe(
      gnosisSafeSingleton,
      gnosisSafeProxyFactory,
      deployer
    );

    // Deploy Registry Module
    const registryModuleSingleton = await deployRegistryModuleSingleton();
    const moduleProxyFactory = await deployModuleProxyFactory();
    registryModule = await deployRegistryModule(
      registryModuleSingleton,
      moduleProxyFactory,
      gnosisSafe.address
    );

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
    const currentEpochStart = now - STAKING_LENGTH / 2;

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
      strategyModule.address,
      deployer
    );

    await enableModule(gnosisSafe, registryModule.address, deployer);
  });

  after(async () => {
    await restoreSnapshot(snapshotId);
  });

  it("should correctly rage quit", async function () {
    // Deposit
    await mockToken
      .connect(depositor)
      .approve(stakingModule.address, DEPOSIT_AMOUNT);
    await stakingModule
      .connect(depositor)
      .deposit(DEPOSIT_AMOUNT, depositor.address);

    // Time travel to TRADING phase
    await timeTravel(STAKING_LENGTH);

    // Utilize funds
    await sendArbitraryTx(
      gnosisSafe,
      mockToken.address,
      mockToken.interface.encodeFunctionData("transfer", [
        strategyModule.address,
        UTILIZE_AMOUNT,
      ]),
      deployer
    );

    // Add one position
    await mockPositionOne
      .connect(strategyModule)
      .transfer(gnosisSafe.address, POSITION_ONE_AMOUNT);
    await accountingModule
      .connect(strategyModule)
      .changeHoldingPosition(mockPositionOne.address, true);

    const SHARES_QUIT =
      DEPOSIT_AMOUNT.mul(RAGE_QUIT_PERCENTAGE).div(BASE_PERCENTAGE);
    const POSITION_ONE_QUIT =
      POSITION_ONE_AMOUNT.mul(RAGE_QUIT_PERCENTAGE).div(BASE_PERCENTAGE);
    const POSITION_TWO_QUIT =
      POSITION_TWO_AMOUNT.mul(RAGE_QUIT_PERCENTAGE).div(BASE_PERCENTAGE);
    const LIQUIDITY_QUIT =
      DEPOSIT_AMOUNT.mul(RAGE_QUIT_PERCENTAGE).div(BASE_PERCENTAGE);
    const TOKENS_QUIT =
      POOL_HOLDINGS.mul(RAGE_QUIT_PERCENTAGE).div(BASE_PERCENTAGE);

    const TOKENS = [
      mockToken.address.toLowerCase(),
      mockPositionOne.address.toLowerCase(),
      mockPositionTwo.address.toLowerCase(),
    ].sort();

    // Check revert on unregistered positions
    await expect(
      stakingModule
        .connect(depositor)
        .rageQuit(SHARES_QUIT, depositor.address, depositor.address, TOKENS)
    ).to.be.revertedWith("S6");

    // Add second position
    await mockPositionTwo
      .connect(strategyModule)
      .transfer(gnosisSafe.address, POSITION_TWO_AMOUNT);
    await accountingModule
      .connect(strategyModule)
      .changeHoldingPosition(mockPositionTwo.address, true);

    // Check revert on wrong order or duplicate
    await expect(
      stakingModule
        .connect(depositor)
        .rageQuit(SHARES_QUIT, depositor.address, depositor.address, [
          ...TOKENS,
          mockPositionTwo.address.toLowerCase(),
        ])
    ).to.be.revertedWith("S7");

    const depositorSharesBefore = await stakingModule.balanceOf(
      depositor.address
    );
    const depositorPositionOneBefore = await mockPositionOne.balanceOf(
      depositor.address
    );
    const depositorPositionTwoBefore = await mockPositionTwo.balanceOf(
      depositor.address
    );
    const liquidityBefore = await accountingModule.getTotalLiquidity();
    const depositorTokensBefore = await mockToken.balanceOf(depositor.address);

    // Execute rage quit
    await stakingModule
      .connect(depositor)
      .rageQuit(SHARES_QUIT, depositor.address, depositor.address, TOKENS);

    const depositorSharesAfter = await stakingModule.balanceOf(
      depositor.address
    );
    const depositorPositionOneAfter = await mockPositionOne.balanceOf(
      depositor.address
    );
    const depositorPositionTwoAfter = await mockPositionTwo.balanceOf(
      depositor.address
    );
    const liquidityAfter = await accountingModule.getTotalLiquidity();
    const depositorTokensAfter = await mockToken.balanceOf(depositor.address);

    expect(depositorSharesAfter).to.be.equal(
      depositorSharesBefore.sub(SHARES_QUIT)
    );
    expect(depositorPositionOneAfter).to.be.equal(
      depositorPositionOneBefore.add(POSITION_ONE_QUIT)
    );
    expect(depositorPositionTwoAfter).to.be.equal(
      depositorPositionTwoBefore.add(POSITION_TWO_QUIT)
    );
    expect(liquidityAfter).to.be.equal(liquidityBefore.sub(LIQUIDITY_QUIT));
    expect(depositorTokensAfter).to.be.equal(
      depositorTokensBefore.add(TOKENS_QUIT)
    );
  });
});
