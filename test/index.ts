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
  setStrategyAdvisor,
} from "./mixins";

import {
  MockToken,
  GnosisSafeL2,
  StakingModule,
  RegistryModule,
  OptionsSellingStrategyModule,
  AccountingModule,
  LifecycleModule,
  PoolsLens,
} from "./../typechain/";

import {
  timeTravel,
  takeSnapshot,
  restoreSnapshot,
  getCurrentTimestamp,
} from "./utils";

// Strategy constants
const BASE = ethers.utils.parseEther("1");

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

  let gnosisSafe: GnosisSafeL2;
  let mockToken: MockToken;
  let stakingModule: StakingModule;
  let strategyModule: OptionsSellingStrategyModule;
  let registryModule: RegistryModule;
  let accountingModule: AccountingModule;
  let lifecycleModule: LifecycleModule;

  let poolsLens: PoolsLens;

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
    epochStart = now - 3600; // Now - 1hour
    const LifecycleModule = await ethers.getContractFactory("LifecycleModule");
    lifecycleModule = <LifecycleModule>(
      await upgrades.deployProxy(LifecycleModule, [
        epochStart,
        [EPOCH_LENGTH, STAKING_LENGTH, TRADING_LENGTH],
        registryModule.address,
        gnosisSafe.address,
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

    // Deploy Strategy Module
    const OptionsSellingStrategyModule = await ethers.getContractFactory(
      "OptionsSellingStrategyModule"
    );
    strategyModule = <OptionsSellingStrategyModule>(
      await upgrades.deployProxy(OptionsSellingStrategyModule, [
        OPIUM_REGISTRY,
        OPIUM_LENS,
        registryModule.address,
        gnosisSafe.address,
      ])
    );
    await strategyModule.deployed();

    await enableModule(gnosisSafe, registryModule.address, deployer);

    await setupRegistry(
      gnosisSafe,
      registryModule,
      accountingModule,
      lifecycleModule,
      stakingModule,
      strategyModule.address,
      deployer
    );

    await setStrategyAdvisor(gnosisSafe, strategyModule, advisor, deployer);

    // Deploy Lens Contract
    const PoolsLens = await ethers.getContractFactory("PoolsLens");
    poolsLens = <PoolsLens>await upgrades.deployProxy(PoolsLens);
    await poolsLens.deployed();
  });

  after(async () => {
    await restoreSnapshot(snapshotId);
  });

  it("should receive modules addresses", async () => {
    const {
      stakingAddress,
      accountingAddress,
      lifecycleAddress,
      vaultAddress,
      strategyAddress,
    } = await poolsLens.getPoolModules(registryModule.address);
    expect(stakingAddress).to.be.equal(stakingModule.address);
    expect(accountingAddress).to.be.equal(accountingModule.address);
    expect(lifecycleAddress).to.be.equal(lifecycleModule.address);
    expect(vaultAddress).to.be.equal(await registryModule.avatar());
    expect(strategyAddress).to.be.equal(strategyModule.address);
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

    // Staking Lens
    const { userStaked } = await poolsLens.getStakingData(
      stakingModule.address,
      lifecycleModule.address,
      staker.address
    );
    expect(userStaked).to.equal(DEPOSIT_AMOUNT);

    // Accounting Lens
    const {
      poolSize,
      poolUtilization,
      managementFee,
      performanceFee,
      marginDecimals,
      marginAddress,
      marginTitle,
    } = await poolsLens.getAccountingData(accountingModule.address);
    expect(poolSize).to.equal(DEPOSIT_AMOUNT);
    expect(poolUtilization).to.equal("0");
    expect(managementFee).to.equal(
      await accountingModule.getAnnualMaintenanceFee()
    );
    expect(performanceFee).to.equal(
      await accountingModule.getImmediateProfitFee()
    );
    expect(marginDecimals).to.equal(await mockToken.decimals());
    expect(marginAddress).to.equal(mockToken.address);
    expect(marginTitle).to.equal(await mockToken.name());

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
    const TOTAL_PREMIUM = PREMIUM.mul(availableQuantity.availableQuantity).div(
      BASE
    );
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

    // Check pool utilization via Accounting Lens
    const { poolUtilization } = await poolsLens.getAccountingData(
      accountingModule.address
    );
    expect(poolUtilization).to.equal(ethers.utils.parseEther("0.99"));

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
