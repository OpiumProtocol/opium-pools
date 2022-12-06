import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers, upgrades } from "hardhat";
import { BigNumberish, BigNumber } from "ethers";

import {
  deployGnosisSafeSingleton,
  deployGnosisSafeFactory,
  deployGnosisSafe,
  deployRegistryModuleSingleton,
  deployModuleProxyFactory,
  deployRegistryModule,
  enableModule,
  setupRegistry,
} from "../mixins";

import {
  AccountingModule,
  RegistryModule,
  MockToken,
  GnosisSafeL2,
  LifecycleModule,
  StakingModule,
  IERC20,
  PoolsLens,
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

// Constants
const ZERO = ethers.constants.Zero;
const BASE = ethers.utils.parseEther("1");

// Gnosis Safe Utils
const GNOSIS_SAFE_FALLBACK_HANDLER =
  "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4";

describe("ScheduledDepositsAndWithdrawals", function () {
  let accountingModule: AccountingModule;
  let registryModule: RegistryModule;
  let lifecycleModule: LifecycleModule;
  let stakingModule: StakingModule;

  let deployer: SignerWithAddress;
  let strategyModule: SignerWithAddress;
  let depositor: SignerWithAddress;
  let poolsLens: PoolsLens;

  let gnosisSafe: GnosisSafeL2;

  let mockToken: MockToken;
  let mockPosition: MockToken;

  let currentEpochStart: number;

  let snapshotId: any;
  let snapshotIdEach: any;

  before(async () => {
    snapshotId = await takeSnapshot();

    [deployer, strategyModule, depositor] = await ethers.getSigners();

    // Deploy mocks
    const MockToken = await ethers.getContractFactory("MockToken");
    mockToken = (await MockToken.deploy()) as MockToken;
    await mockToken.deployed();

    mockPosition = (await MockToken.deploy()) as MockToken;
    await mockPosition.deployed();

    // Setup GnosisSafe
    const gnosisSafeSingleton = await deployGnosisSafeSingleton();
    const gnosisSafeProxyFactory = await deployGnosisSafeFactory();
    gnosisSafe = await deployGnosisSafe(
      gnosisSafeSingleton,
      gnosisSafeProxyFactory,
      GNOSIS_SAFE_FALLBACK_HANDLER,
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
      strategyModule.address,
      deployer
    );

    await enableModule(gnosisSafe, registryModule.address, deployer);

    // Deploy Lens Contract
    const PoolsLens = await ethers.getContractFactory("PoolsLens");
    poolsLens = <PoolsLens>await upgrades.deployProxy(PoolsLens);
    await poolsLens.deployed();
  });

  after(async () => {
    await restoreSnapshot(snapshotId);
  });

  beforeEach(async () => {
    snapshotIdEach = await takeSnapshot();
  });

  afterEach(async () => {
    await restoreSnapshot(snapshotIdEach);
  });

  type AssertBalances = {
    depositor: BigNumber;
    stakingModule: BigNumber;
    pool: BigNumber;
  };

  const assertBalances = async (
    token: IERC20,
    balances: AssertBalances,
    verbose?: string
  ) => {
    const [
      actualDepositorBalance,
      actualStakingModuleBalance,
      actualPoolBalance,
    ] = await Promise.all([
      token.balanceOf(depositor.address),
      token.balanceOf(stakingModule.address),
      token.balanceOf(gnosisSafe.address),
    ]);

    if (verbose) {
      console.log(`
        Balances ${verbose}
        - depositor: ${ethers.utils.formatEther(
          actualDepositorBalance
        )} (real) vs ${ethers.utils.formatEther(balances.depositor)} (expected)
        - stakingModule: ${ethers.utils.formatEther(
          actualStakingModuleBalance
        )} (real) vs ${ethers.utils.formatEther(
        balances.stakingModule
      )} (expected)
        - pool: ${ethers.utils.formatEther(
          actualPoolBalance
        )} (real) vs ${ethers.utils.formatEther(balances.pool)} (expected)
      `);
    }

    expect(actualDepositorBalance).to.be.equal(balances.depositor);
    expect(actualStakingModuleBalance).to.be.equal(balances.stakingModule);
    expect(actualPoolBalance).to.be.equal(balances.pool);
  };

  type AssertScheduledDeposit = {
    updatedAtEpoch: BigNumber;
    depositedAssets: BigNumber;
    scheduledShares: BigNumber;
  };

  const assertScheduledDeposit = async (
    deposit: AssertScheduledDeposit,
    verbose?: string,
    skip?: boolean
  ) => {
    const scheduledDeposit = await stakingModule.scheduledDeposits(
      depositor.address
    );
    if (verbose) {
      console.log(`
        ScheduledDeposit ${verbose}
        - updatedAtEpoch: ${scheduledDeposit.updatedAtEpoch} (real) vs ${
        deposit.updatedAtEpoch
      } (expected)
        - depositedAssets: ${ethers.utils.formatEther(
          scheduledDeposit.depositedAssets
        )} (real) vs ${ethers.utils.formatEther(
        deposit.depositedAssets
      )} (expected)
        - scheduledShares: ${ethers.utils.formatEther(
          scheduledDeposit.scheduledShares
        )} (real) vs ${ethers.utils.formatEther(
        deposit.scheduledShares
      )} (expected)
      `);
    }

    expect(scheduledDeposit.updatedAtEpoch).to.be.equal(deposit.updatedAtEpoch);
    expect(scheduledDeposit.depositedAssets).to.be.equal(
      deposit.depositedAssets
    );
    expect(scheduledDeposit.scheduledShares).to.be.equal(
      deposit.scheduledShares
    );

    if (!skip) {
      const { pendingStake, claimableShares } = await poolsLens.getStakingData(
        stakingModule.address,
        lifecycleModule.address,
        depositor.address
      );
      expect(pendingStake).to.equal(deposit.depositedAssets);
      expect(claimableShares).to.equal(deposit.scheduledShares);
    }
  };

  type AssertScheduledWithdrawal = {
    updatedAtEpoch: BigNumber;
    withdrawnShares: BigNumber;
    scheduledAssets: BigNumber;
  };

  const assertScheduledWithdrawal = async (
    withdrawal: AssertScheduledWithdrawal,
    verbose?: string,
    skip?: boolean
  ) => {
    const scheduledWithdrawal = await stakingModule.scheduledWithdrawals(
      depositor.address
    );

    if (verbose) {
      console.log(`
        ScheduledWithdrawal ${verbose}
        - updatedAtEpoch: ${scheduledWithdrawal.updatedAtEpoch} (real) vs ${
        withdrawal.updatedAtEpoch
      } (expected)
        - withdrawnShares: ${ethers.utils.formatEther(
          scheduledWithdrawal.withdrawnShares
        )} (real) vs ${ethers.utils.formatEther(
        withdrawal.withdrawnShares
      )} (expected)
        - scheduledAssets: ${ethers.utils.formatEther(
          scheduledWithdrawal.scheduledAssets
        )} (real) vs ${ethers.utils.formatEther(
        withdrawal.scheduledAssets
      )} (expected)
      `);
    }

    expect(scheduledWithdrawal.updatedAtEpoch).to.be.equal(
      withdrawal.updatedAtEpoch
    );
    expect(scheduledWithdrawal.withdrawnShares).to.be.equal(
      withdrawal.withdrawnShares
    );
    expect(scheduledWithdrawal.scheduledAssets).to.be.equal(
      withdrawal.scheduledAssets
    );

    if (!skip) {
      const { pendingWithdrawal, claimableAssets } =
        await poolsLens.getStakingData(
          stakingModule.address,
          lifecycleModule.address,
          depositor.address
        );
      expect(pendingWithdrawal).to.equal(withdrawal.withdrawnShares);
      expect(claimableAssets).to.equal(withdrawal.scheduledAssets);
    }
  };

  type AssertTotal = {
    totalScheduledDeposits: BigNumber;
    totalScheduledWithdrawals: BigNumber;
  };

  const assertTotal = async (total: AssertTotal, verbose?: string) => {
    const totalScheduledDeposits = await stakingModule.totalScheduledDeposits();
    const totalScheduledWithdrawals =
      await stakingModule.totalScheduledWithdrawals();

    if (verbose) {
      console.log(`
        Total ${verbose}
        - totalScheduledDeposits: ${totalScheduledDeposits} (real) vs ${
        total.totalScheduledDeposits
      } (expected)
        - totalScheduledWithdrawals: ${ethers.utils.formatEther(
          totalScheduledWithdrawals
        )} (real) vs ${ethers.utils.formatEther(
        total.totalScheduledWithdrawals
      )} (expected)
      `);
    }

    expect(totalScheduledDeposits).to.be.equal(total.totalScheduledDeposits);
    expect(totalScheduledWithdrawals).to.be.equal(
      total.totalScheduledWithdrawals
    );
  };

  const assertScheduledShares = async (
    scheduled: BigNumberish,
    verbose?: string
  ) => {
    const scheduledShares = await stakingModule.getScheduledShares(
      depositor.address
    );

    if (verbose) {
      console.log(`
        ScheduledShares ${verbose}
        - scheduledShares: ${ethers.utils.formatEther(
          scheduledShares
        )} (real) vs ${ethers.utils.formatEther(scheduled)} (expected)
      `);
    }
    expect(scheduledShares).to.be.equal(scheduled);
  };

  const assertScheduledAssets = async (
    scheduled: BigNumberish,
    verbose?: string
  ) => {
    const scheduledAssets = await stakingModule.getScheduledAssets(
      depositor.address
    );

    if (verbose) {
      console.log(`
        ScheduledAssets ${verbose}
        - scheduledAssets: ${ethers.utils.formatEther(
          scheduledAssets
        )} (real) vs ${ethers.utils.formatEther(scheduled)} (expected)
      `);
    }

    expect(scheduledAssets).to.be.equal(scheduled);
  };

  // Tests Constructor
  enum EStageAction {
    // Pool
    TIME_TRAVEL,
    ADD_PROFIT,
    REBALANCE,
    DIRECT_DEPOSIT,
    // Deposits
    SCHEDULE_DEPOSIT,
    UNSCHEDULE_DEPOSIT,
    CLAIM_SCHEDULED_SHARES,
    // Withdrawals
    SCHEDULE_WITHDRAWAL,
    UNSCHEDULE_WITHDRAWAL,
    CLAIM_SCHEDULED_ASSETS,
  }

  type TStage = {
    action: EStageAction;
    amount?: BigNumber;
    seconds?: number;
    verbose?: string;
  };

  const run = async (
    initOptions: { initialAmount: BigNumber; verbose?: string },
    stages: TStage[]
  ) => {
    const assertTokenBalances: AssertBalances = {
      depositor: initOptions.initialAmount,
      stakingModule: ZERO,
      pool: ZERO,
    };
    const assertSharesBalances: AssertBalances = {
      depositor: ZERO,
      stakingModule: ZERO,
      pool: ZERO,
    };
    const assertScheduledDepositValues: AssertScheduledDeposit = {
      updatedAtEpoch: ZERO,
      depositedAssets: ZERO,
      scheduledShares: ZERO,
    };
    const assertScheduledWithdrawalValues: AssertScheduledWithdrawal = {
      updatedAtEpoch: ZERO,
      withdrawnShares: ZERO,
      scheduledAssets: ZERO,
    };
    const assertTotalValues: AssertTotal = {
      totalScheduledDeposits: ZERO,
      totalScheduledWithdrawals: ZERO,
    };

    await mockToken.transfer(depositor.address, initOptions.initialAmount);
    await mockToken
      .connect(depositor)
      .approve(stakingModule.address, ethers.constants.MaxUint256);

    const assetAll = async (verbose?: string, skip?: boolean) => {
      await assertBalances(mockToken, assertTokenBalances, verbose);
      await assertBalances(stakingModule, assertSharesBalances, verbose);
      await assertScheduledDeposit(assertScheduledDepositValues, verbose, skip);
      await assertScheduledWithdrawal(
        assertScheduledWithdrawalValues,
        verbose,
        skip
      );
      await assertTotal(assertTotalValues, verbose);
    };

    await assetAll(initOptions.verbose);

    for (const stage of stages) {
      if (stage.action === EStageAction.TIME_TRAVEL) {
        const seconds = stage.seconds || 0;
        await timeTravel(seconds);

        continue;
      }

      if (stage.action === EStageAction.ADD_PROFIT) {
        const PROFIT_AMOUNT = stage.amount || ZERO;
        await mockToken.transfer(gnosisSafe.address, PROFIT_AMOUNT);

        assertTokenBalances.pool = assertTokenBalances.pool.add(PROFIT_AMOUNT);

        continue;
      }

      if (stage.action === EStageAction.DIRECT_DEPOSIT) {
        const DEPOSIT_AMOUNT = stage.amount || ZERO;
        await stakingModule
          .connect(depositor)
          .deposit(DEPOSIT_AMOUNT, depositor.address);

        assertTokenBalances.depositor =
          assertTokenBalances.depositor.sub(DEPOSIT_AMOUNT);
        assertTokenBalances.pool = assertTokenBalances.pool.add(DEPOSIT_AMOUNT);

        const SHARES = await stakingModule.previewDeposit(DEPOSIT_AMOUNT);

        assertSharesBalances.depositor =
          assertSharesBalances.depositor.add(SHARES);

        await assetAll(stage.verbose);

        continue;
      }

      if (stage.action === EStageAction.REBALANCE) {
        await accountingModule.connect(strategyModule).rebalance();

        const SCHEDULED_SHARES = await stakingModule.previewDeposit(
          assertTotalValues.totalScheduledDeposits
        );
        const SCHEDULED_ASSETS = await stakingModule.previewRedeem(
          assertTotalValues.totalScheduledWithdrawals
        );

        assertTokenBalances.stakingModule = assertTokenBalances.stakingModule
          .add(SCHEDULED_ASSETS)
          .sub(assertTotalValues.totalScheduledDeposits);
        assertTokenBalances.pool = assertTokenBalances.pool
          .add(assertTotalValues.totalScheduledDeposits)
          .sub(SCHEDULED_ASSETS);

        assertSharesBalances.stakingModule = assertSharesBalances.stakingModule
          .add(SCHEDULED_SHARES)
          .sub(assertTotalValues.totalScheduledWithdrawals);

        assertTotalValues.totalScheduledDeposits = ZERO;
        assertTotalValues.totalScheduledWithdrawals = ZERO;

        await assetAll(stage.verbose, true);

        continue;
      }

      if (stage.action === EStageAction.SCHEDULE_DEPOSIT) {
        const SCHEDULE_DEPOSIT_AMOUNT = stage.amount || ZERO;

        await stakingModule
          .connect(depositor)
          .scheduleDeposit(SCHEDULE_DEPOSIT_AMOUNT, depositor.address);

        assertTokenBalances.depositor = assertTokenBalances.depositor.sub(
          SCHEDULE_DEPOSIT_AMOUNT
        );
        assertTokenBalances.stakingModule =
          assertTokenBalances.stakingModule.add(SCHEDULE_DEPOSIT_AMOUNT);

        assertScheduledDepositValues.depositedAssets =
          assertScheduledDepositValues.depositedAssets.add(
            SCHEDULE_DEPOSIT_AMOUNT
          );

        assertTotalValues.totalScheduledDeposits =
          assertTotalValues.totalScheduledDeposits.add(SCHEDULE_DEPOSIT_AMOUNT);

        await assetAll(stage.verbose);

        continue;
      }

      if (stage.action === EStageAction.UNSCHEDULE_DEPOSIT) {
        const UNSCHEDULE_DEPOSIT_AMOUNT = stage.amount || ZERO;

        await stakingModule
          .connect(depositor)
          .unscheduleDeposit(UNSCHEDULE_DEPOSIT_AMOUNT);

        assertTokenBalances.depositor = assertTokenBalances.depositor.add(
          UNSCHEDULE_DEPOSIT_AMOUNT
        );
        assertTokenBalances.stakingModule =
          assertTokenBalances.stakingModule.sub(UNSCHEDULE_DEPOSIT_AMOUNT);

        assertScheduledDepositValues.depositedAssets =
          assertScheduledDepositValues.depositedAssets.sub(
            UNSCHEDULE_DEPOSIT_AMOUNT
          );

        assertTotalValues.totalScheduledDeposits =
          assertTotalValues.totalScheduledDeposits.sub(
            UNSCHEDULE_DEPOSIT_AMOUNT
          );

        await assetAll(stage.verbose);

        continue;
      }

      if (stage.action === EStageAction.CLAIM_SCHEDULED_SHARES) {
        const SHARE_PRICE = await stakingModule.sharePriceByEpoch(
          assertScheduledDepositValues.updatedAtEpoch
        );
        const SCHEDULED_SHARES = assertScheduledDepositValues.depositedAssets
          .mul(SHARE_PRICE)
          .div(BASE);

        await assertScheduledShares(SCHEDULED_SHARES, stage.verbose);

        await stakingModule
          .connect(depositor)
          .claimScheduledShares(SCHEDULED_SHARES, false);

        assertSharesBalances.stakingModule =
          assertSharesBalances.stakingModule.sub(SCHEDULED_SHARES);
        assertSharesBalances.depositor =
          assertSharesBalances.depositor.add(SCHEDULED_SHARES);

        assertScheduledDepositValues.updatedAtEpoch =
          assertScheduledDepositValues.updatedAtEpoch.add(1);
        assertScheduledDepositValues.depositedAssets = ZERO;
        assertScheduledDepositValues.scheduledShares = ZERO;

        await assetAll(stage.verbose);

        continue;
      }

      if (stage.action === EStageAction.SCHEDULE_WITHDRAWAL) {
        const SCHEDULE_WITHDRAWAL_AMOUNT = stage.amount || ZERO;

        await stakingModule
          .connect(depositor)
          .scheduleWithdrawal(
            SCHEDULE_WITHDRAWAL_AMOUNT,
            depositor.address,
            depositor.address
          );

        assertSharesBalances.depositor = assertSharesBalances.depositor.sub(
          SCHEDULE_WITHDRAWAL_AMOUNT
        );
        assertSharesBalances.stakingModule =
          assertSharesBalances.stakingModule.add(SCHEDULE_WITHDRAWAL_AMOUNT);

        assertScheduledWithdrawalValues.updatedAtEpoch =
          assertScheduledWithdrawalValues.updatedAtEpoch.add(1);
        assertScheduledWithdrawalValues.withdrawnShares =
          assertScheduledWithdrawalValues.withdrawnShares.add(
            SCHEDULE_WITHDRAWAL_AMOUNT
          );

        assertTotalValues.totalScheduledWithdrawals =
          assertTotalValues.totalScheduledWithdrawals.add(
            SCHEDULE_WITHDRAWAL_AMOUNT
          );

        await assetAll(stage.verbose);

        continue;
      }

      if (stage.action === EStageAction.UNSCHEDULE_WITHDRAWAL) {
        const UNSCHEDULE_WITHDRAWAL_AMOUNT = stage.amount || ZERO;

        await stakingModule
          .connect(depositor)
          .unscheduleWithdrawal(UNSCHEDULE_WITHDRAWAL_AMOUNT);

        assertSharesBalances.depositor = assertSharesBalances.depositor.add(
          UNSCHEDULE_WITHDRAWAL_AMOUNT
        );
        assertSharesBalances.stakingModule =
          assertSharesBalances.stakingModule.sub(UNSCHEDULE_WITHDRAWAL_AMOUNT);

        assertScheduledWithdrawalValues.withdrawnShares =
          assertScheduledWithdrawalValues.withdrawnShares.sub(
            UNSCHEDULE_WITHDRAWAL_AMOUNT
          );

        assertTotalValues.totalScheduledWithdrawals =
          assertTotalValues.totalScheduledWithdrawals.sub(
            UNSCHEDULE_WITHDRAWAL_AMOUNT
          );

        await assetAll(stage.verbose);

        continue;
      }

      if (stage.action === EStageAction.CLAIM_SCHEDULED_ASSETS) {
        const SHARE_PRICE = await stakingModule.sharePriceByEpoch(
          assertScheduledWithdrawalValues.updatedAtEpoch
        );
        const SCHEDULED_ASSETS = assertScheduledWithdrawalValues.withdrawnShares
          .mul(BASE)
          .div(SHARE_PRICE);

        await assertScheduledAssets(SCHEDULED_ASSETS, stage.verbose);

        await stakingModule
          .connect(depositor)
          .claimScheduledAssets(SCHEDULED_ASSETS, false);

        assertTokenBalances.depositor =
          assertTokenBalances.depositor.add(SCHEDULED_ASSETS);
        assertTokenBalances.stakingModule =
          assertTokenBalances.stakingModule.sub(SCHEDULED_ASSETS);

        assertScheduledWithdrawalValues.updatedAtEpoch =
          assertScheduledWithdrawalValues.updatedAtEpoch.add(1);
        assertScheduledWithdrawalValues.withdrawnShares = ZERO;
        assertScheduledWithdrawalValues.scheduledAssets = ZERO;

        await assetAll(stage.verbose);

        continue;
      }
    }
  };

  it("should run scenario #1", async () => {
    await run(
      {
        initialAmount: ethers.utils.parseEther("500"),
      },
      [
        {
          action: EStageAction.DIRECT_DEPOSIT,
          amount: ethers.utils.parseEther("100"),
        },
        /** DEPOSIT */
        {
          action: EStageAction.TIME_TRAVEL,
          seconds: STAKING_LENGTH + TRADING_LENGTH, // Time travel to IDLE phase (0)
        },
        {
          action: EStageAction.SCHEDULE_DEPOSIT,
          amount: ethers.utils.parseEther("200"),
        },
        {
          action: EStageAction.UNSCHEDULE_DEPOSIT,
          amount: ethers.utils.parseEther("100"),
        },
        {
          action: EStageAction.TIME_TRAVEL,
          seconds: EPOCH_LENGTH - STAKING_LENGTH - TRADING_LENGTH, // Time travel to STAKING phase (1)
        },
        {
          action: EStageAction.ADD_PROFIT,
          amount: ethers.utils.parseEther("1"),
        },
        {
          action: EStageAction.REBALANCE,
        },
        {
          action: EStageAction.CLAIM_SCHEDULED_SHARES,
        },
        /** WITHDRAWAL */
        {
          action: EStageAction.TIME_TRAVEL,
          seconds: STAKING_LENGTH + TRADING_LENGTH, // Time travel to IDLE phase (1)
        },
        {
          action: EStageAction.SCHEDULE_WITHDRAWAL,
          amount: ethers.utils.parseEther("100"),
        },
        {
          action: EStageAction.UNSCHEDULE_WITHDRAWAL,
          amount: ethers.utils.parseEther("50"),
        },
        {
          action: EStageAction.TIME_TRAVEL,
          seconds: EPOCH_LENGTH - STAKING_LENGTH - TRADING_LENGTH, // Time travel to STAKING phase (2)
        },
        {
          action: EStageAction.REBALANCE,
        },
        {
          action: EStageAction.CLAIM_SCHEDULED_ASSETS,
        },
      ]
    );
  });
});
