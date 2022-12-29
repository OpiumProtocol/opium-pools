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
  PoolsLens,
} from "../../typechain";

import {
  deployGnosisSafe,
  enableModule,
  setupRegistry,
  setStrategyDerivative,
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
const WETH_ADDRESS = "0x8800Ab5dE5976A682aA4ACF76f01C703Ce963413";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, ethers } = hre;
  const { deploy } = deployments;

  const [deployer] = await ethers.getSigners();

  // Skip if network is not correct
  if (network.name !== "polygon") {
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
  //   gnosisSafeSingleton, // Singleton
  //   gnosisSafeProxyFactory, // Proxy Factory
  //   GNOSIS_FALLBACK_HANDLER, // Fallback handler
  //   deployer // Safe Owner
  // );
  const gnosisSafe = await ethers.getContractAt<GnosisSafeL2>(
    "GnosisSafeL2",
    "0x1d4e997a588a0eec38ca5074f7905aa8839b2f5b"
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
    "0x0EE0428E2C3436902b1C9059E0c2fa23E3172915"
  );
  console.log(`Deployed RegistryModule @ ${registryModule.address}`);

  /** #3: Deploy AccountingModule */
  // const AccountingFactory = await ethers.getContractFactory("AccountingModule");
  // const accountingModule = (await upgrades.deployProxy(AccountingFactory, [
  //   WETH_ADDRESS, // Underlying
  //   registryModule.address, // Registry
  //   gnosisSafe.address, // Owner
  // ])) as AccountingModule;
  const accountingModule = await ethers.getContractAt<AccountingModule>(
    "AccountingModule",
    "0x3B9C117F0057BCf102729b51464C708f29971980"
  );
  console.log(`Deployed AccountingModule @ ${accountingModule.address}`);

  /** #4: Deploy LifecycleModule */
  // const LifecycleFactory = await ethers.getContractFactory("LifecycleModule");
  // const epochStart = ~~(Date.now() / 1000);
  // const EPOCH_LENGTH = 3600 * 5 + 100;
  // const STAKING_LENGTH = 3600 * 3;
  // const TRADING_LENGTH = 3600 * 2;
  // const lifecycleModule = (await upgrades.deployProxy(LifecycleFactory, [
  //   epochStart, // Epoch start
  //   [EPOCH_LENGTH, STAKING_LENGTH, TRADING_LENGTH], // Lengths
  //   registryModule.address, // Registry
  //   gnosisSafe.address, // Owner
  // ])) as LifecycleModule;
  const lifecycleModule = await ethers.getContractAt<LifecycleModule>(
    "LifecycleModule",
    "0xb38E08796239Bd466044530597FeB06169AA97DB"
  );
  console.log(`Deployed LifecycleModule @ ${lifecycleModule.address}`);

  /** #5: Deploy StakingModule */
  // const StakingFactory = await ethers.getContractFactory("StakingModule");
  // const stakingModule = (await upgrades.deployProxy(StakingFactory, [
  //   "LP Token", // Name
  //   "LPT", // Symbol
  //   registryModule.address, // Registry
  //   gnosisSafe.address, // Owner
  // ])) as StakingModule;
  const stakingModule = await ethers.getContractAt<StakingModule>(
    "StakingModule",
    "0x4f6f12b85F565df3CA9029911709C0b5D63c9E5D"
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
      "0xE44dCf75069d849b0f0cdE323525035d835C2d53"
    );
  // const OLD_optionCallSellingStrategy =
  //   await ethers.getContractAt<OptionCallSellingStrategy>(
  //     "OptionCallSellingStrategy",
  //     "0x8a07710F34E3F383aA293fd163Ae789160C7d160"
  //   );
  console.log(
    `Deployed OptionCallSellingStrategy @ ${optionCallSellingStrategy.address}`
  );

  /** #7: Enable Registry Module */
  // await enableModule(gnosisSafe, registryModule.address, deployer);
  console.log("Registry module enabled");

  /** #8: Setup Registry */
  // await (
  //   await setupRegistry(
  //     gnosisSafe,
  //     registryModule,
  //     accountingModule,
  //     lifecycleModule,
  //     stakingModule,
  //     optionCallSellingStrategy.address,
  //     deployer
  //   )
  // ).wait();
  console.log("Registry is set up");

  /** #9 (General): Deploy PoolsLens */
  // const poolsLens = await deploy("PoolsLens", {
  //   from: deployer.address,
  //   args: [],
  //   log: true,
  // });
  const poolsLens = await ethers.getContractAt<PoolsLens>(
    "PoolsLens",
    "0xB183Df5F877B35aA2290d15eb96D350845358431"
  );
  console.log(`Deployed PoolsLens @ ${poolsLens.address}`);

  /** Setup strategy */
  // const ONE_ETH = ethers.utils.parseEther("1");
  // const SYNTHETIC_ID_ADDRESS = "0x6E797659154AD0D6f199feaFA2E2086Ce0239Fbf"; // OPT-C
  // const ORACLE_ID_ADDRESS = "0xc135be47accef605e72c5017e450ae0207c97afb"; // ETH/USD
  // const STRIKE_PRICE = ethers.utils.parseEther("1400");
  // const COLLATERALIZATION = ethers.utils.parseEther("1");

  // const derivative = {
  //   margin: ONE_ETH,
  //   endTime: await lifecycleModule.getCurrentEpochEnd(),
  //   params: [STRIKE_PRICE, COLLATERALIZATION, 0],
  //   syntheticId: SYNTHETIC_ID_ADDRESS,
  //   token: WETH_ADDRESS,
  //   oracleId: ORACLE_ID_ADDRESS,
  // };
  // const derivative = await OLD_optionCallSellingStrategy.getDerivative();
  // await setStrategyDerivative(
  //   gnosisSafe,
  //   optionCallSellingStrategy as unknown as OptionCallSellingStrategy,
  //   derivative,
  //   deployer
  // );
  console.log("Strategy derivative is set");

  /** Rebalance Pool (Initialize Epoch) */
  // await (await optionCallSellingStrategy.execute()).wait();
  // await (await optionCallSellingStrategy.rebalance()).wait();
  // console.log("Rebalanced");

  // DON'T PERSIST THE DEPLOYMENT in migrations
  return false;
};

export default func;
func.id = "00_TEST";
func.tags = ["OpiumPool", "example"];

// Deployed GnosisSafe @ 0x1d4e997a588a0eec38ca5074f7905aa8839b2f5b
// Deployed RegistryModule @ 0x0EE0428E2C3436902b1C9059E0c2fa23E3172915
// Deployed AccountingModule @ 0x3B9C117F0057BCf102729b51464C708f29971980
// Deployed LifecycleModule @ 0xb38E08796239Bd466044530597FeB06169AA97DB
// Deployed StakingModule @ 0x4f6f12b85F565df3CA9029911709C0b5D63c9E5D
// Deployed OptionCallSellingStrategy @ 0xE44dCf75069d849b0f0cdE323525035d835C2d53
// Registry module enabled
// Registry is set up
// Deployed PoolsLens @ 0xB183Df5F877B35aA2290d15eb96D350845358431
// Strategy derivative is set
