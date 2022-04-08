import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  deployGnosisSafeSingleton,
  deployGnosisSafeFactory,
  deployGnosisSafe,
  enableModule,
  setupRegistry,
} from "./mixins";

import { MockToken, GnosisSafe, StakingModule } from "./../typechain/";

// Lifecycle Module constants
const EPOCH_LENGTH = 3600 * 24 * 7; // 1 week
const STAKING_LENGTH = 3600 * 4; // 4 hours
const TRADING_LENGTH = 3600 * 24 * 2; // 2 days

describe("StakingModule", function () {
  let deployer: SignerWithAddress;
  let staker: SignerWithAddress;

  let gnosisSafe: GnosisSafe;
  let mockToken: MockToken;
  let stakingModule: StakingModule;

  before(async () => {
    [deployer, staker] = await ethers.getSigners();

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
    const LifecycleModule = await ethers.getContractFactory("LifecycleModule");
    const lifecycleModule = await LifecycleModule.deploy(
      ~~(Date.now() / 1000) - 3600,
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

    await enableModule(gnosisSafe, registryModule.address, deployer);
    await enableModule(gnosisSafe, stakingModule.address, deployer);

    await setupRegistry(
      gnosisSafe,
      registryModule,
      accountingModule,
      lifecycleModule,
      stakingModule,
      deployer
    );
  });

  it("should deposit and withdraw", async function () {
    // Send tokens to staker
    const DEPOSIT_AMOUNT = ethers.utils.parseEther("1000");

    await mockToken.transfer(staker.address, DEPOSIT_AMOUNT);

    expect(await mockToken.balanceOf(staker.address)).to.equal(DEPOSIT_AMOUNT);

    // Deposit
    await mockToken
      .connect(staker)
      .approve(stakingModule.address, DEPOSIT_AMOUNT);

    await stakingModule.connect(staker).deposit(DEPOSIT_AMOUNT);

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
    await stakingModule.connect(staker).withdraw(DEPOSIT_AMOUNT);

    expect(await mockToken.balanceOf(staker.address)).to.equal(DEPOSIT_AMOUNT);
    expect(await stakingModule.balanceOf(staker.address)).to.equal("0");

    expect(await stakingModule.totalSupply()).to.equal("0");
    expect(await mockToken.balanceOf(stakingModule.address)).to.equal("0");

    expect(await mockToken.balanceOf(gnosisSafe.address)).to.equal("0");
  });
});
