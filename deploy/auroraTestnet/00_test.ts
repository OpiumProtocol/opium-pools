import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { upgrades } from "hardhat";
import { AbiCoder } from "ethers/lib/utils";

import {
  GnosisSafeL2,
  GnosisSafeProxyFactory,
  RegistryModule,
  AccountingModule,
  LifecycleModule,
  StakingModule,
  PoolsLens,
} from "../../typechain";

import {
  deployGnosisSafe,
  enableModule,
  setupRegistry,
} from "../../test/mixins";

const GNOSIS_SAFE_MASTER_COPY_ADDRESS =
  "0x3E5c63644E683549055b9Be8653de26E0B4CD36E";
const GNOSIS_SAFE_PROXY_FACTORY_ADDRESS =
  "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";

const UNDERLYING_TOKEN_ADDRESS = "0xA5C7FDbe2a8B814369e89EAed7EE52630fcb4C59";

const CRONJOB_ADDRESS = "0x2C2BAd64569080DF0834beb9E1fAbca8a09Bf0D9";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { network, ethers } = hre;

  const [deployer] = await ethers.getSigners();

  // Skip if network is not Aurora Testnet
  if (network.name !== "auroraTestnet") {
    return;
  }

  /** #1: Deploy GnosisSafe */

  // const gnosisSafeSingleton = await ethers.getContractAt<GnosisSafeL2>(
  //   "GnosisSafeL2",
  //   GNOSIS_SAFE_MASTER_COPY_ADDRESS
  // );

  // const gnosisSafeProxyFactory =
  //   await ethers.getContractAt<GnosisSafeProxyFactory>(
  //     "GnosisSafeProxyFactory",
  //     GNOSIS_SAFE_PROXY_FACTORY_ADDRESS
  //   );

  // const gnosisSafe = await deployGnosisSafe(
  //   gnosisSafeSingleton,
  //   gnosisSafeProxyFactory,
  //   deployer
  // );
  const gnosisSafe = await ethers.getContractAt<GnosisSafeL2>(
    "GnosisSafeL2",
    "0x7b6312c3bf23520eab2bec5d0e38d082aa47f96e"
  );
  console.log(`Deployed GnosisSafe @ ${gnosisSafe.address}`);

  /** #2: Deploy Registry */
  // const RegistryFactory = await ethers.getContractFactory("RegistryModule");
  // const registryInitializerParams = new AbiCoder().encode(
  //   ["address", "address", "address"],
  //   [gnosisSafe.address, gnosisSafe.address, gnosisSafe.address]
  // );
  // const registryModule = (await upgrades.deployProxy(
  //   RegistryFactory,
  //   [registryInitializerParams],
  //   {
  //     initializer: "setUp",
  //   }
  // )) as RegistryModule;
  const registryModule = await ethers.getContractAt<RegistryModule>(
    "RegistryModule",
    "0x419aa1B768D1476305574a3cb61B7acBF6bD4308"
  );
  console.log(`Deployed RegistryModule @ ${registryModule.address}`);

  /** #3: Deploy AccountingModule */
  // const AccountingFactory = await ethers.getContractFactory("AccountingModule");
  // const accountingModule = (await upgrades.deployProxy(AccountingFactory, [
  //   UNDERLYING_TOKEN_ADDRESS,
  //   registryModule.address,
  //   gnosisSafe.address,
  // ])) as AccountingModule;
  const accountingModule = await ethers.getContractAt<AccountingModule>(
    "AccountingModule",
    "0x89c9c6731817CE9d3F52dC96E1481086bc1b328C"
  );
  console.log(`Deployed AccountingModule @ ${accountingModule.address}`);

  /** #4: Deploy LifecycleModule */
  // const LifecycleFactory = await ethers.getContractFactory("LifecycleModule");
  // const epochStart = ~~(Date.now() / 1000);
  // const EPOCH_LENGTH = 3600 * 5 + 100;
  // const STAKING_LENGTH = 3600 * 3;
  // const TRADING_LENGTH = 3600 * 2;
  // const lifecycleModule = (await upgrades.deployProxy(LifecycleFactory, [
  //   epochStart,
  //   [EPOCH_LENGTH, STAKING_LENGTH, TRADING_LENGTH],
  //   registryModule.address,
  //   gnosisSafe.address,
  // ])) as LifecycleModule;
  const lifecycleModule = await ethers.getContractAt<LifecycleModule>(
    "LifecycleModule",
    "0xFEb2AD9c24AbB83079E6B0b515A318798f569598"
  );
  console.log(`Deployed LifecycleModule @ ${lifecycleModule.address}`);

  /** #5: Deploy StakingModule */
  // const StakingFactory = await ethers.getContractFactory("StakingModule");
  // const stakingModule = (await upgrades.deployProxy(StakingFactory, [
  //   "LP Token",
  //   "LPT",
  //   registryModule.address,
  //   gnosisSafe.address,
  // ])) as StakingModule;
  const stakingModule = await ethers.getContractAt<StakingModule>(
    "StakingModule",
    "0x39787F0aeDB73eeeE6Ceb0B22eF9293a3f3Df5aF"
  );
  console.log(`Deployed StakingModule @ ${stakingModule.address}`);

  /** #6: Deploy StrategyModule */
  // SKIPPED

  /** #7: Enable Registry Module */
  // await enableModule(gnosisSafe, registryModule.address, deployer);
  console.log("Registry module enabled");

  /** #8: Setup Registry */
  // const STRATEGY_ADDRESS = CRONJOB_ADDRESS;
  // await setupRegistry(
  //   gnosisSafe,
  //   registryModule,
  //   accountingModule,
  //   lifecycleModule,
  //   stakingModule,
  //   STRATEGY_ADDRESS,
  //   deployer
  // );
  console.log("Registry is set up");

  // /** #9 (General): Deploy PoolsLens */
  // const PoolsLens = await ethers.getContractFactory("PoolsLens");
  // const poolsLens = (await PoolsLens.deploy()) as PoolsLens;
  // // const poolsLens = await ethers.getContractAt<PoolsLens>(
  // //   "PoolsLens",
  // //   ""
  // // );
  // console.log(`Deployed PoolsLens @ ${poolsLens.address}`);

  // /** Rebalance Pool (Initialize Epoch) */
  // // await accountingModule.rebalance();
  // // console.log("Rebalanced");

  // // DON'T PERSIST THE DEPLOYMENT in migrations
  return false;
};

export default func;
func.id = "00_TEST";
func.tags = ["OpiumPool", "aurora", "testnet"];
