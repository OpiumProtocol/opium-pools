import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { LifecycleModule, RegistryModule } from "../../typechain";

import {
  timeTravel,
  takeSnapshot,
  restoreSnapshot,
  getCurrentTimestamp,
} from "../utils";

const EPOCH_LENGTH = 3600 * 24 * 7; // 1 week
const STAKING_LENGTH = 3600 * 4; // 4 hours
const TRADING_LENGTH = 3600 * 24 * 2; // 2 days

const FUTURE_OFFSET = 3600; // 1 hour

const LOCAL_DELTA = 600; // 10 minutes

/**
 * Not initialized   Staking phase   Trading phase   Idle phase   Not initialized   Staking phase
 * _______________ | _____________ | _____________ | __________ | _______________ | _____________
 *      E0:NA             E1:S           E1:T           E1:I           E1:I             E2:S
 */

describe("LifecycleModule", function () {
  let lifecycleModule: LifecycleModule;
  let registryModule: RegistryModule;
  let deployer: SignerWithAddress;
  let accountingModule: SignerWithAddress;

  let snapshotId: any;

  let TIME_DELTA: number;

  let currentEpochStart: number;

  before(async () => {
    snapshotId = await takeSnapshot();

    [deployer, accountingModule] = await ethers.getSigners();

    const now = await getCurrentTimestamp();
    currentEpochStart = now + FUTURE_OFFSET;

    // Deploy Registry Module
    const RegistryModule = await ethers.getContractFactory("RegistryModule");
    registryModule = <RegistryModule>(
      await upgrades.deployProxy(RegistryModule, [deployer.address])
    );
    await registryModule.deployed();

    // Deploy Lifecycle Module
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

    TIME_DELTA = (await lifecycleModule.TIME_DELTA()).toNumber();

    // Additional setup
    await registryModule.setRegistryAddresses({
      accountingModule: accountingModule.address,
      lifecycleModule: lifecycleModule.address,
      stakingModule: deployer.address,
    });
  });

  after(async () => {
    await restoreSnapshot(snapshotId);
  });

  it("should correctly return initial values", async function () {
    const currentEpochStartResult =
      await lifecycleModule.getCurrentEpochStart();
    expect(currentEpochStartResult).to.be.equal(currentEpochStart);

    const currentEpochEndResult = await lifecycleModule.getCurrentEpochEnd();
    expect(currentEpochEndResult).to.be.equal(currentEpochStart + EPOCH_LENGTH);

    const epochLengthResult = await lifecycleModule.getEpochLength();
    expect(epochLengthResult).to.be.equal(EPOCH_LENGTH);

    const stakingPhaseLengthResult =
      await lifecycleModule.getStakingPhaseLength();
    expect(stakingPhaseLengthResult).to.be.equal(STAKING_LENGTH);

    const tradingPhaseResult = await lifecycleModule.getTradingPhaseLength();
    expect(tradingPhaseResult).to.be.equal(TRADING_LENGTH);
  });

  it("should correctly behave in E0:NA phase", async function () {
    // Phases
    const isStakingPhase = await lifecycleModule.isStakingPhase();
    expect(isStakingPhase).to.be.equal(false);
    const isTradingPhase = await lifecycleModule.isTradingPhase();
    expect(isTradingPhase).to.be.equal(false);
    const isIdlePhase = await lifecycleModule.isIdlePhase();
    expect(isIdlePhase).to.be.equal(false);

    // Allowed actions
    const canDeposit = await lifecycleModule.canDeposit();
    expect(canDeposit).to.be.equal(false);
    const canWithdraw = await lifecycleModule.canWithdraw();
    expect(canWithdraw).to.be.equal(false);
    const canTrade = await lifecycleModule.canTrade();
    expect(canTrade).to.be.equal(false);
    const canRebalance = await lifecycleModule.canRebalance();
    expect(canRebalance).to.be.equal(false);
  });

  it("should correctly behave in E1:S phase", async function () {
    // Time travel to Epoch 1: Staking Phase
    await timeTravel(FUTURE_OFFSET + TIME_DELTA + LOCAL_DELTA);

    // Phases
    const isStakingPhase = await lifecycleModule.isStakingPhase();
    expect(isStakingPhase).to.be.equal(true);
    const isTradingPhase = await lifecycleModule.isTradingPhase();
    expect(isTradingPhase).to.be.equal(false);
    const isIdlePhase = await lifecycleModule.isIdlePhase();
    expect(isIdlePhase).to.be.equal(false);

    // Allowed actions
    const canDeposit = await lifecycleModule.canDeposit();
    expect(canDeposit).to.be.equal(true);
    const canWithdraw = await lifecycleModule.canWithdraw();
    expect(canWithdraw).to.be.equal(true);
    const canTrade = await lifecycleModule.canTrade();
    expect(canTrade).to.be.equal(false);
    const canRebalance = await lifecycleModule.canRebalance();
    expect(canRebalance).to.be.equal(false);
  });

  it("should correctly behave in E1:T phase", async function () {
    // Time travel to Epoch 1: Trading Phase
    await timeTravel(STAKING_LENGTH);

    // Phases
    const isStakingPhase = await lifecycleModule.isStakingPhase();
    expect(isStakingPhase).to.be.equal(false);
    const isTradingPhase = await lifecycleModule.isTradingPhase();
    expect(isTradingPhase).to.be.equal(true);
    const isIdlePhase = await lifecycleModule.isIdlePhase();
    expect(isIdlePhase).to.be.equal(false);

    // Allowed actions
    const canDeposit = await lifecycleModule.canDeposit();
    expect(canDeposit).to.be.equal(true);
    const canWithdraw = await lifecycleModule.canWithdraw();
    expect(canWithdraw).to.be.equal(false);
    const canTrade = await lifecycleModule.canTrade();
    expect(canTrade).to.be.equal(true);
    const canRebalance = await lifecycleModule.canRebalance();
    expect(canRebalance).to.be.equal(false);
  });

  it("should correctly behave in E1:I phase", async function () {
    // Time travel to Epoch 1: Idle Phase
    await timeTravel(TRADING_LENGTH);

    // Phases
    const isStakingPhase = await lifecycleModule.isStakingPhase();
    expect(isStakingPhase).to.be.equal(false);
    const isTradingPhase = await lifecycleModule.isTradingPhase();
    expect(isTradingPhase).to.be.equal(false);
    const isIdlePhase = await lifecycleModule.isIdlePhase();
    expect(isIdlePhase).to.be.equal(true);

    // Allowed actions
    const canDeposit = await lifecycleModule.canDeposit();
    expect(canDeposit).to.be.equal(false);
    const canWithdraw = await lifecycleModule.canWithdraw();
    expect(canWithdraw).to.be.equal(false);
    const canTrade = await lifecycleModule.canTrade();
    expect(canTrade).to.be.equal(false);
    const canRebalance = await lifecycleModule.canRebalance();
    expect(canRebalance).to.be.equal(false);
  });

  it("should correctly behave in E1:NA phase", async function () {
    // Time travel to Epoch 1: Not Initialized Phase
    await timeTravel(EPOCH_LENGTH - STAKING_LENGTH - TRADING_LENGTH);

    // Phases
    const isStakingPhase = await lifecycleModule.isStakingPhase();
    expect(isStakingPhase).to.be.equal(false);
    const isTradingPhase = await lifecycleModule.isTradingPhase();
    expect(isTradingPhase).to.be.equal(false);
    const isIdlePhase = await lifecycleModule.isIdlePhase();
    expect(isIdlePhase).to.be.equal(true);

    // Allowed actions
    const canDeposit = await lifecycleModule.canDeposit();
    expect(canDeposit).to.be.equal(false);
    const canWithdraw = await lifecycleModule.canWithdraw();
    expect(canWithdraw).to.be.equal(false);
    const canTrade = await lifecycleModule.canTrade();
    expect(canTrade).to.be.equal(false);
    const canRebalance = await lifecycleModule.canRebalance();
    expect(canRebalance).to.be.equal(true);
  });

  it("should correctly behave in E2:S phase", async function () {
    // Initialize epoch
    await lifecycleModule.connect(accountingModule).progressEpoch();

    // Phases
    const isStakingPhase = await lifecycleModule.isStakingPhase();
    expect(isStakingPhase).to.be.equal(true);
    const isTradingPhase = await lifecycleModule.isTradingPhase();
    expect(isTradingPhase).to.be.equal(false);
    const isIdlePhase = await lifecycleModule.isIdlePhase();
    expect(isIdlePhase).to.be.equal(false);

    // Allowed actions
    const canDeposit = await lifecycleModule.canDeposit();
    expect(canDeposit).to.be.equal(true);
    const canWithdraw = await lifecycleModule.canWithdraw();
    expect(canWithdraw).to.be.equal(true);
    const canTrade = await lifecycleModule.canTrade();
    expect(canTrade).to.be.equal(false);
    const canRebalance = await lifecycleModule.canRebalance();
    expect(canRebalance).to.be.equal(false);
  });

  it("should correctly return values after epoch progress", async function () {
    const currentEpochStartResult =
      await lifecycleModule.getCurrentEpochStart();
    expect(currentEpochStartResult).to.be.equal(
      currentEpochStart + EPOCH_LENGTH
    );

    const currentEpochEndResult = await lifecycleModule.getCurrentEpochEnd();
    expect(currentEpochEndResult).to.be.equal(
      currentEpochStart + EPOCH_LENGTH * 2
    );
  });

  it("should revert on unauthorized access and when rebalancing is not in time", async function () {
    await expect(lifecycleModule.progressEpoch()).to.be.revertedWith("LM1");
    await expect(
      lifecycleModule.connect(accountingModule).progressEpoch()
    ).to.be.revertedWith("LM2");
  });
});
