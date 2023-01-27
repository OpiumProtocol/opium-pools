/** Deployment Template
 *
 * // 1. Check all TODOs to run the deployment properly
 * // 2. Use commented code to use already deployed contract instead of deploying new one
 *
 */

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
  OptionCallSellingStrategy,
} from "../../typechain";

import {
  deployGnosisSafe,
  enableModule,
  setupRegistry,
  setStrategyDerivative,
  sendArbitraryTx,
} from "../../test/mixins";

// Safe Constants
const GNOSIS_SAFE_MASTER_COPY_ADDRESS =
  "0x3E5c63644E683549055b9Be8653de26E0B4CD36E";
const GNOSIS_SAFE_PROXY_FACTORY_ADDRESS =
  "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
const GNOSIS_FALLBACK_HANDLER = "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4";

// Strategy Constants
const GNOSIS_SAFE_SIGN_MESSAGE_LIB_ADDRESS =
  "0xA65387F16B013cf2Af4605Ad8aA5ec25a2cbA3a2";
const OPIUM_REGISTRY_ADDRESS = "0x17b6ffe276e8A4a299a5a87a656aFc5b8FA3ee4a";
const OPIUM_LENS_ADDRESS = "0x33afAaA35df82D56833B7EEacb2b65Eb805AC774";
const AUCTION_HELPER_ADDRESS = "0x06eb4bCc14b8C1664a2d4e2CdE8fA2F992332fCd";
const LIMIT_ORDER_PROTOCOL_ADDRESS =
  "0x94bc2a1c732bcad7343b25af48385fe76e08734f";

// Misc
const WBTC_ADDRESS = "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, ethers } = hre;
  const { deploy } = deployments;

  const [deployer] = await ethers.getSigners();

  // Skip if network is not correct
  if (network.name !== "polygon") {
    return;
  }

  /** #1: Deploy GnosisSafe */
  const gnosisSafeSingleton = await ethers.getContractAt<GnosisSafeL2>(
    "GnosisSafeL2",
    GNOSIS_SAFE_MASTER_COPY_ADDRESS
  );

  const gnosisSafeProxyFactory =
    await ethers.getContractAt<GnosisSafeProxyFactory>(
      "GnosisSafeProxyFactory",
      GNOSIS_SAFE_PROXY_FACTORY_ADDRESS
    );

  // const gnosisSafe = await deployGnosisSafe(
  //   gnosisSafeSingleton, // Singleton
  //   gnosisSafeProxyFactory, // Proxy Factory
  //   GNOSIS_FALLBACK_HANDLER, // Fallback handler
  //   deployer // Safe Owner
  // );
  const gnosisSafe = await ethers.getContractAt<GnosisSafeL2>(
    "GnosisSafeL2",
    "0xf70a970cd80098cd6de31ae6c0bb3637ae27de56"
  );
  console.log(`Deployed GnosisSafe @ ${gnosisSafe.address}`);

  /** #2: Deploy Registry */
  // const RegistryFactory = await ethers.getContractFactory("RegistryModule");
  // const registryInitializerParams = new AbiCoder().encode(
  //   ["address", "address", "address"],
  //   [
  //     gnosisSafe.address, // Owner
  //     gnosisSafe.address, // Avatar
  //     gnosisSafe.address, // Target
  //   ]
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
    "0xe0CBf4F7B0BA46c4c35CDe49A20E0388f9e9C2d1"
  );
  console.log(`Deployed RegistryModule @ ${registryModule.address}`);

  /** #3: Deploy AccountingModule */
  // const AccountingFactory = await ethers.getContractFactory("AccountingModule");
  // const accountingModule = (await upgrades.deployProxy(AccountingFactory, [
  //   WBTC_ADDRESS, // Underlying
  //   registryModule.address, // Registry
  //   gnosisSafe.address, // Owner
  // ])) as AccountingModule;
  const accountingModule = await ethers.getContractAt<AccountingModule>(
    "AccountingModule",
    "0xB36EfD06069fa41d867c0165a66BD6D7909CfE11"
  );
  console.log(`Deployed AccountingModule @ ${accountingModule.address}`);

  /** #4: Deploy LifecycleModule */
  // const LifecycleFactory = await ethers.getContractFactory("LifecycleModule");
  // const epochStart = 1674806400; // Fri Jan 27 2023 08:00:00 GMT+0000
  // const EPOCH_LENGTH = 3600 * 24 * 7; // 7 days
  // const STAKING_LENGTH = 3600 * 1; // 1 hour
  // const TRADING_LENGTH = 3600 * 24 * 2 + 3600 * 3; // 2 days 3 hours
  // const lifecycleModule = (await upgrades.deployProxy(LifecycleFactory, [
  //   epochStart, // Epoch start
  //   [EPOCH_LENGTH, STAKING_LENGTH, TRADING_LENGTH], // Lengths
  //   registryModule.address, // Registry
  //   gnosisSafe.address, // Owner
  // ])) as LifecycleModule;
  const lifecycleModule = await ethers.getContractAt<LifecycleModule>(
    "LifecycleModule",
    "0x3A3B69748B5affB42D04e22774BBA0923C3ecA72"
  );
  console.log(`Deployed LifecycleModule @ ${lifecycleModule.address}`);

  /** #5: Deploy StakingModule */
  // const StakingFactory = await ethers.getContractFactory("StakingModule");
  // const stakingModule = (await upgrades.deployProxy(StakingFactory, [
  //   "Opium V2 Weekly BTC: Genesis", // Name
  //   "OPIUM2_LP_4771", // Symbol
  //   registryModule.address, // Registry
  //   gnosisSafe.address, // Owner
  // ])) as StakingModule;
  const stakingModule = await ethers.getContractAt<StakingModule>(
    "StakingModule",
    "0x4170A1Bdcfef69d4C5a6a84101298Afc40e0b41d"
  );
  console.log(`Deployed StakingModule @ ${stakingModule.address}`);

  /** #6: Deploy StrategyModule */
  // const optionCallSellingStrategy = await deploy("OptionCallSellingStrategy", {
  //   from: deployer.address,
  //   args: [
  //     OPIUM_REGISTRY_ADDRESS, // Opium Registry
  //     OPIUM_LENS_ADDRESS, // Opium Lens
  //     GNOSIS_SAFE_SIGN_MESSAGE_LIB_ADDRESS, // Gnosis Safe: Sign Helper
  //     AUCTION_HELPER_ADDRESS, // Auction Helper
  //     LIMIT_ORDER_PROTOCOL_ADDRESS, // Limit order protocol
  //     registryModule.address, // Registry
  //     gnosisSafe.address, // Owner
  //     deployer.address, // Advisor
  //   ],
  //   log: true,
  // });
  const optionCallSellingStrategy =
    await ethers.getContractAt<OptionCallSellingStrategy>(
      "OptionCallSellingStrategy",
      "0x5D903992054d61E32dDc3daB743d4B4835a2FF2a"
    );
  console.log(
    `Deployed OptionCallSellingStrategy @ ${optionCallSellingStrategy.address}`
  );

  /** #7: Enable Registry Module */
  // await enableModule(gnosisSafe, registryModule.address, deployer);
  console.log("Registry module enabled");

  /** #8: Setup Registry */
  // await setupRegistry(
  //   gnosisSafe,
  //   registryModule,
  //   accountingModule,
  //   lifecycleModule,
  //   stakingModule,
  //   optionCallSellingStrategy.address,
  //   deployer
  // );
  console.log("Registry is set up");

  /** #9: Setup strategy */
  // const ONE_ETH = ethers.utils.parseUnits("1", 8); // 1e8
  // const SYNTHETIC_ID_ADDRESS = "0x6E797659154AD0D6f199feaFA2E2086Ce0239Fbf"; // OPT-C
  // const ORACLE_ID_ADDRESS = "0xD5253bE928c9fd7BC4C6de4a68F54B2156B9857F"; // BTC/USD
  // const STRIKE_PRICE = ethers.utils.parseEther("27000");
  // const COLLATERALIZATION = ethers.utils.parseEther("1");

  // const derivative = {
  //   margin: ONE_ETH,
  //   endTime: await lifecycleModule.getCurrentEpochEnd(),
  //   params: [STRIKE_PRICE, COLLATERALIZATION, 0],
  //   syntheticId: SYNTHETIC_ID_ADDRESS,
  //   token: WBTC_ADDRESS,
  //   oracleId: ORACLE_ID_ADDRESS,
  // };
  // await setStrategyDerivative(
  //   gnosisSafe,
  //   optionCallSellingStrategy as unknown as OptionCallSellingStrategy,
  //   derivative,
  //   deployer
  // );
  console.log("Strategy derivative is set");

  /** #10: Setup accounting */
  // const BENCHMARK_PROFIT = ethers.utils.parseEther("0.0010");
  // await sendArbitraryTx(
  //   gnosisSafe,
  //   accountingModule.address,
  //   accountingModule.interface.encodeFunctionData("setBenchmarkProfit", [
  //     BENCHMARK_PROFIT,
  //   ]),
  //   deployer
  // );
  console.log("Benchmark profit is set");

  return true;
};

export default func;
func.id = "00_POLYGON";
func.tags = ["OpiumPool", "OptionCallSellingStrategy"];

// Deployed GnosisSafe @ 0xf70a970cd80098cd6de31ae6c0bb3637ae27de56
// Deployed RegistryModule @ 0xe0CBf4F7B0BA46c4c35CDe49A20E0388f9e9C2d1
// Deployed AccountingModule @ 0xB36EfD06069fa41d867c0165a66BD6D7909CfE11
// Deployed LifecycleModule @ 0x3A3B69748B5affB42D04e22774BBA0923C3ecA72
// Deployed StakingModule @ 0x4170A1Bdcfef69d4C5a6a84101298Afc40e0b41d
// Deployed OptionCallSellingStrategy @ 0x5D903992054d61E32dDc3daB743d4B4835a2FF2a
