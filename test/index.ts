import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  deployGnosisSafeSingleton,
  deployGnosisSafeFactory,
  deployGnosisSafe,
  enableModule,
  setupRegistry,
  setStrategyAdvisor,
  enableStrategyInRegistry,
} from "./mixins";

import {
  MockToken,
  GnosisSafe,
  StakingModule,
  OptionsSellingStrategyModule,
} from "./../typechain/";

import {
  timeTravel,
  takeSnapshot,
  restoreSnapshot,
  getCurrentTimestamp,
} from "./utils";

// Lifecycle Module constants
const EPOCH_LENGTH = 3600 * 24 * 7; // 1 week
const STAKING_LENGTH = 3600 * 4; // 4 hours
const TRADING_LENGTH = 3600 * 24 * 2; // 2 days

// Strategy Module constants
const OPIUM_REGISTRY = "0x17b6ffe276e8A4a299a5a87a656aFc5b8FA3ee4a"; // Arbitrum One
const OPIUM_LENS = "0xfa01Fd6118445F811753D96178F2ef8AE77caa53"; // Arbitrum One

describe("E2E Test", function () {
  let deployer: SignerWithAddress;
  let staker: SignerWithAddress;
  let buyer: SignerWithAddress;
  let advisor: SignerWithAddress;

  let gnosisSafe: GnosisSafe;
  let mockToken: MockToken;
  let stakingModule: StakingModule;
  let strategyModule: OptionsSellingStrategyModule;

  let snapshotId: any;

  let epochStart: number;

  before(async () => {
    snapshotId = await takeSnapshot();

    [deployer, staker, buyer, advisor] = await ethers.getSigners();

    // SETUP STARTED

    // Setup GnosisSafe
    const gnosisSafeSingleton = await deployGnosisSafeSingleton();
    const gnosisSafeProxyFactory = await deployGnosisSafeFactory();
    gnosisSafe = await deployGnosisSafe(
      gnosisSafeSingleton,
      gnosisSafeProxyFactory,
      deployer
    );

    // Deploy mocks
    const MockToken = await ethers.getContractFactory("MockToken");
    mockToken = await MockToken.deploy();
    await mockToken.deployed();

    // Deploy Registry Module
    const RegistryModule = await ethers.getContractFactory("RegistryModule");
    const registryModule = await RegistryModule.deploy(gnosisSafe.address);
    await registryModule.deployed();

    // Deploy Accounting Module
    const AccountingModule = await ethers.getContractFactory(
      "AccountingModule"
    );
    const accountingModule = await AccountingModule.deploy(
      mockToken.address,
      registryModule.address,
      gnosisSafe.address
    );
    await accountingModule.deployed();

    // Deploy Lifecycle Module
    const now = await getCurrentTimestamp();
    epochStart = now - 3600; // Now - 1hour
    const LifecycleModule = await ethers.getContractFactory("LifecycleModule");
    const lifecycleModule = await LifecycleModule.deploy(
      epochStart,
      [EPOCH_LENGTH, STAKING_LENGTH, TRADING_LENGTH],
      registryModule.address,
      gnosisSafe.address
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

    // Deploy Strategy Module
    const OptionsSellingStrategyModule = await ethers.getContractFactory(
      "OptionsSellingStrategyModule"
    );
    strategyModule = await OptionsSellingStrategyModule.deploy(
      OPIUM_REGISTRY,
      OPIUM_LENS,
      registryModule.address,
      gnosisSafe.address
    );
    await strategyModule.deployed();

    await enableModule(gnosisSafe, stakingModule.address, deployer);
    await enableModule(gnosisSafe, strategyModule.address, deployer);

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

    await setStrategyAdvisor(gnosisSafe, strategyModule, advisor, deployer);
  });

  after(async () => {
    await restoreSnapshot(snapshotId);
  });

  it("should deposit and withdraw", async function () {
    // Send tokens to staker
    const DEPOSIT_AMOUNT = ethers.utils.parseEther("1000");
    const WITHDRAW_AMOUNT = ethers.utils.parseEther("500");
    const diff = DEPOSIT_AMOUNT.sub(WITHDRAW_AMOUNT);

    await mockToken.transfer(staker.address, DEPOSIT_AMOUNT);

    expect(await mockToken.balanceOf(staker.address)).to.equal(DEPOSIT_AMOUNT);

    // Deposit
    await mockToken
      .connect(staker)
      .approve(stakingModule.address, DEPOSIT_AMOUNT);

    await stakingModule.connect(staker).deposit(DEPOSIT_AMOUNT, staker.address);

    expect(await mockToken.balanceOf(staker.address)).to.equal("0");
    expect(await stakingModule.balanceOf(staker.address)).to.equal(
      DEPOSIT_AMOUNT
    );

    expect(await stakingModule.totalSupply()).to.equal(DEPOSIT_AMOUNT);
    expect(await mockToken.balanceOf(stakingModule.address)).to.equal("0");

    expect(await mockToken.balanceOf(gnosisSafe.address)).to.equal(
      DEPOSIT_AMOUNT
    );

    // Withdraw
    await stakingModule
      .connect(staker)
      .withdraw(WITHDRAW_AMOUNT, staker.address, staker.address);

    expect(await mockToken.balanceOf(staker.address)).to.equal(WITHDRAW_AMOUNT);
    expect(await stakingModule.balanceOf(staker.address)).to.equal(diff);

    expect(await stakingModule.totalSupply()).to.equal(diff);
    expect(await mockToken.balanceOf(stakingModule.address)).to.equal("0");

    expect(await mockToken.balanceOf(gnosisSafe.address)).to.equal(diff);
  });

  it("should perform strategy", async () => {
    // Time travel to Staking phase + 1 hour
    await timeTravel(STAKING_LENGTH + 3600);

    const ONE_ETH = ethers.utils.parseEther("1");
    const SYNTHETIC_ID_ADDRESS = "0x61EFdF8c52b49A347E69dEe7A62e0921A3545cF7"; // OPT-C
    const ORACLE_ID_ADDRESS = "0xAF5F031b8D5F12AD80d5E5f13C99249d82AfFfe2"; // ETH/USD
    const STRIKE_PRICE = ethers.utils.parseEther("3000");
    const COLLATERALIZATION = ethers.utils.parseEther("1");

    const derivative = {
      margin: ONE_ETH,
      endTime: epochStart + EPOCH_LENGTH,
      params: [STRIKE_PRICE, COLLATERALIZATION, 0],
      syntheticId: SYNTHETIC_ID_ADDRESS,
      token: mockToken.address,
      oracleId: ORACLE_ID_ADDRESS,
    };

    const opiumLens = await ethers.getContractAt(
      "IOpiumOnChainPositionsLens",
      OPIUM_LENS
    );
    const positionAddresses =
      await opiumLens.predictPositionsAddressesByDerivative(derivative);

    const availableQuantity = await strategyModule.getAvailableQuantity(
      derivative
    );

    await strategyModule.connect(advisor).mintPositions(derivative);

    const PREMIUM = ethers.utils.parseEther("0.01");
    const TOTAL_PREMIUM = PREMIUM.mul(availableQuantity.availableQuantity);
    await mockToken.transfer(buyer.address, TOTAL_PREMIUM);
    await mockToken
      .connect(buyer)
      .approve(strategyModule.address, TOTAL_PREMIUM);

    await strategyModule
      .connect(advisor)
      .setPremium(positionAddresses.longPositionAddress, PREMIUM);

    await strategyModule
      .connect(buyer)
      .purchasePosition(
        positionAddresses.longPositionAddress,
        availableQuantity.availableQuantity,
        PREMIUM
      );

    // Time travel to Next epoch
    await timeTravel(EPOCH_LENGTH - STAKING_LENGTH);

    const oracle = await ethers.getContractAt(
      "IOpiumOracle",
      derivative.oracleId
    );
    await oracle._callback(derivative.endTime);

    await strategyModule.executePositions(derivative);

    await strategyModule.rebalance();
  });
});
