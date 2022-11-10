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

import { deployGnosisSafe, enableModule, setupRegistry } from "../../test/mixins";

const GNOSIS_SAFE_MASTER_COPY_ADDRESS =
  "0x3E5c63644E683549055b9Be8653de26E0B4CD36E";
const GNOSIS_SAFE_PROXY_FACTORY_ADDRESS =
  "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";

const WETH_ADDRESS = "0x8800Ab5dE5976A682aA4ACF76f01C703Ce963413";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network, ethers } = hre;
  const { deploy } = deployments;

  const [deployer] = await ethers.getSigners();

  // TODO: Change network here
  // Skip if network is not correct
  if (network.name !== "correct") {
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
    "0x520249dbd6c6ba5b796baf1f3ce28277c5cbee91"
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
    "0x92124c725145897d248Df25B3371fAcE90d1CcfA"
  );
  console.log(`Deployed RegistryModule @ ${registryModule.address}`);

  /** #3: Deploy AccountingModule */
  // const AccountingFactory = await ethers.getContractFactory("AccountingModule");
  // const accountingModule = (await upgrades.deployProxy(AccountingFactory, [
  //   WETH_ADDRESS,
  //   registryModule.address,
  //   gnosisSafe.address,
  // ])) as AccountingModule;
  const accountingModule = await ethers.getContractAt<AccountingModule>(
    "AccountingModule",
    "0x65c61597e7e92Ef149a331a13b3f3386BA9C9970"
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
    "0x98AFB642d61Dc9aD0B00c5577163a2CF73748951"
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
    "0x703eEA0123c52E90ed36727EA394a89683e1F6a6"
  );
  console.log(`Deployed StakingModule @ ${stakingModule.address}`);

  /** #6: Deploy StrategyModule */
  // SKIPPED

  /** #7: Enable Registry Module */
  // await enableModule(gnosisSafe, registryModule.address, deployer);
  console.log("Registry module enabled");

  /** #8: Setup Registry */
  // const STRATEGY_ADDRESS = deployer.address;
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

  /** #9 (General): Deploy PoolsLens */
  // const PoolsLens = await ethers.getContractFactory("PoolsLens");
  // const poolsLens = (await PoolsLens.deploy()) as PoolsLens;
  const poolsLens = await ethers.getContractAt<PoolsLens>(
    "PoolsLens",
    "0x4F1126598c5892fc98869D505B1B96f52D2c5700"
  );
  console.log(`Deployed PoolsLens @ ${poolsLens.address}`);

  /** Rebalance Pool (Initialize Epoch) */
  await accountingModule.rebalance();
  console.log("Rebalanced");

  // DON'T PERSIST THE DEPLOYMENT in migrations
  return false;
};

export default func;
func.id = "00_TEST";
func.tags = ["OpiumPool", "example"];
