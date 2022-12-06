import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { VoidSigner } from "ethers";

import {
  buildAuctionOrder,
  AuctionPricingFunction,
  AuctionPricingDirection,
  EthersSignerConnector,
} from "@opiumteam/opium-auction-v2-utils";

import {
  LimitOrderBuilder,
  LimitOrderProtocolFacade,
} from "@1inch/limit-order-protocol";

import {
  deployGnosisSafeSingleton,
  deployGnosisSafeFactory,
  deployGnosisSafe,
  deployRegistryModuleSingleton,
  deployModuleProxyFactory,
  deployRegistryModule,
  enableModule,
  setupRegistry,
  setStrategyDerivative,
} from "../mixins";

import {
  MockToken,
  GnosisSafeL2,
  StakingModule,
  RegistryModule,
  OptionCallSellingStrategy,
  AccountingModule,
  LifecycleModule,
  PoolsLens,
} from "../../typechain/";

import {
  timeTravel,
  takeSnapshot,
  restoreSnapshot,
  getCurrentTimestamp,
} from "../utils";

// Strategy constants
const BASE = ethers.utils.parseEther("1");
const minPrice = ethers.utils.parseEther("0.0005");
const maxPrice = ethers.utils.parseEther("0.0020");

// Lifecycle Module constants
const EPOCH_LENGTH = 3600 * 24 * 7; // 1 week
const STAKING_LENGTH = 3600 * 4; // 4 hours
const TRADING_LENGTH = 3600 * 24 * 2; // 2 days

// Strategy Module constants: Arbitrum One
const CHAIN_ID = 42161;
const OPIUM_REGISTRY = "0x17b6ffe276e8A4a299a5a87a656aFc5b8FA3ee4a";
const OPIUM_LENS = "0xfa01Fd6118445F811753D96178F2ef8AE77caa53";
const OPIUM_AUCTION_HELPER = "0x1CaD268F540aa7e5C606b203e8443562332a3a35";
const LIMIT_ORDER_PROTOCOL = "0x7f069df72b7a39bce9806e3afaf579e54d8cf2b9";
const SAFE_SIGN_MESSAGE_LIBRARY = "0xA65387F16B013cf2Af4605Ad8aA5ec25a2cbA3a2";

// Gnosis Safe Utils
const GNOSIS_SAFE_FALLBACK_HANDLER =
  "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4";

describe("OptionCallSellingStrategy", function () {
  let deployer: SignerWithAddress;
  let staker: SignerWithAddress;
  let buyer: SignerWithAddress;
  let advisor: SignerWithAddress;
  let random: SignerWithAddress;

  let gnosisSafe: GnosisSafeL2;
  let mockToken: MockToken;
  let stakingModule: StakingModule;
  let strategyModule: OptionCallSellingStrategy;
  let registryModule: RegistryModule;
  let accountingModule: AccountingModule;
  let lifecycleModule: LifecycleModule;

  let poolsLens: PoolsLens;

  let snapshotId: any;

  let epochStart: number;

  before(async () => {
    snapshotId = await takeSnapshot();

    [deployer, staker, buyer, advisor, random] = await ethers.getSigners();

    // SETUP STARTED

    // Setup GnosisSafe
    const gnosisSafeSingleton = await deployGnosisSafeSingleton();
    const gnosisSafeProxyFactory = await deployGnosisSafeFactory();
    gnosisSafe = await deployGnosisSafe(
      gnosisSafeSingleton,
      gnosisSafeProxyFactory,
      GNOSIS_SAFE_FALLBACK_HANDLER,
      deployer
    );

    // Deploy mocks
    const MockToken = await ethers.getContractFactory("MockToken");
    mockToken = (await MockToken.deploy()) as MockToken;
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
    const OptionCallSellingStrategy = await ethers.getContractFactory(
      "OptionCallSellingStrategy"
    );
    strategyModule = <OptionCallSellingStrategy>(
      await OptionCallSellingStrategy.deploy(
        OPIUM_REGISTRY,
        OPIUM_LENS,
        SAFE_SIGN_MESSAGE_LIBRARY,
        OPIUM_AUCTION_HELPER,
        LIMIT_ORDER_PROTOCOL,
        registryModule.address,
        gnosisSafe.address,
        advisor.address
      )
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
      modules: {
        stakingAddress,
        accountingAddress,
        lifecycleAddress,
        vaultAddress,
        strategyAddress,
      },
    } = await poolsLens.getPoolData(registryModule.address, deployer.address);
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
      accounting: {
        poolSize,
        poolUtilization,
        managementFee,
        performanceFee,
        marginDecimals,
        marginAddress,
        marginTitle,
      },
    } = await poolsLens.getPoolData(registryModule.address, deployer.address);
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
    expect(marginTitle).to.equal(await mockToken.symbol());

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

    // Set a derivative base to strategy
    await setStrategyDerivative(
      gnosisSafe,
      strategyModule,
      derivative,
      deployer
    );

    await strategyModule.mint();

    const newDerivative = await strategyModule.getDerivative();
    const positionAddresses =
      await opiumLens.predictPositionsAddressesByDerivative(newDerivative);

    const availableQuantity = await strategyModule.availableQuantity();

    const tx = await strategyModule.startAuction();
    const receipt = await tx.wait();
    const event = receipt.events?.find(
      (event) => event.event === "AuctionStarted"
    );
    const startedAt = event?.args?.auctionOrder.startedAt.toNumber();
    const endedAt = event?.args?.auctionOrder.endedAt.toNumber();

    const epochId = await lifecycleModule.getEpochId();

    // Signers preparation
    const randomProviderConnector = new EthersSignerConnector(
      random as unknown as VoidSigner
    );
    const randomLimitOrderBuilder = new LimitOrderBuilder(
      LIMIT_ORDER_PROTOCOL,
      CHAIN_ID,
      randomProviderConnector,
      () => epochId.toString()
    );
    const auctionOrder = buildAuctionOrder(
      OPIUM_AUCTION_HELPER,
      randomLimitOrderBuilder,
      {
        makerAssetAddress: positionAddresses.longPositionAddress,
        takerAssetAddress: mockToken.address,
        makerAddress: gnosisSafe.address,
        makerAmount: availableQuantity.toString(),
        nonce: 0,
      },
      {
        pricingFunction: AuctionPricingFunction.EXPONENTIAL,
        pricingDirection: AuctionPricingDirection.DECREASING,
        partialFill: true,
        minTakerAmount: availableQuantity.mul(minPrice).div(BASE).toString(),
        maxTakerAmount: availableQuantity.mul(maxPrice).div(BASE).toString(),
        startedAt: startedAt,
        endedAt: endedAt,
        amplifier: 10,
      }
    );

    const TOTAL_PREMIUM = availableQuantity.mul(maxPrice).div(BASE);
    await mockToken.transfer(buyer.address, TOTAL_PREMIUM);
    await mockToken.connect(buyer).approve(LIMIT_ORDER_PROTOCOL, TOTAL_PREMIUM);
    const takerProviderConnector = new EthersSignerConnector(
      buyer as unknown as VoidSigner
    );
    const takerLimitOrderProtocolFacade = new LimitOrderProtocolFacade(
      LIMIT_ORDER_PROTOCOL,
      takerProviderConnector
    );

    const callData = takerLimitOrderProtocolFacade.fillLimitOrder(
      auctionOrder,
      "0x",
      availableQuantity.toString(),
      "0",
      TOTAL_PREMIUM.toString()
    );
    await buyer.sendTransaction({
      to: LIMIT_ORDER_PROTOCOL,
      data: callData,
    });

    // Check pool utilization via Accounting Lens
    const { poolUtilization } = await poolsLens.getAccountingData(
      accountingModule.address
    );
    expect(poolUtilization.gte(ethers.utils.parseEther("0.99"))).to.equal(true);

    // Check purchaser balance
    const MockToken = await ethers.getContractFactory("MockToken");
    const longPositionToken = (await MockToken.attach(
      positionAddresses.longPositionAddress
    )) as MockToken;
    const buyerBalance = await longPositionToken.balanceOf(buyer.address);
    expect(buyerBalance).to.equal(availableQuantity);

    // Time travel to Next epoch
    await timeTravel(EPOCH_LENGTH - STAKING_LENGTH);

    const oracle = await ethers.getContractAt(
      "IOpiumOracle",
      derivative.oracleId
    );
    await oracle._callback(derivative.endTime);

    await strategyModule.execute();

    await strategyModule.rebalance();
  });
});
