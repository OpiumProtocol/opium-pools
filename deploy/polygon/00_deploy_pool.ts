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
const WETH_ADDRESS = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";

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
    "0x2c381f16ef5a11e64881b3d643fac9b0f9678d4d"
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
    "0xb0417BE3A184889dd7ABbE933141B66D2b1e2A00"
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
    "0xC4fE74605925a92e038dfF33D3B45A62947C0A6e"
  );
  console.log(`Deployed AccountingModule @ ${accountingModule.address}`);

  /** #4: Deploy LifecycleModule */
  // const LifecycleFactory = await ethers.getContractFactory("LifecycleModule");
  // const epochStart = 1671177600; // Fri Dec 16 2022 08:00:00 GMT+0000
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
    "0x813C0Ab2bAf256829a23422904107D4884CEba65"
  );
  console.log(`Deployed LifecycleModule @ ${lifecycleModule.address}`);

  /** #5: Deploy StakingModule */
  // const StakingFactory = await ethers.getContractFactory("StakingModule");
  // const stakingModule = (await upgrades.deployProxy(StakingFactory, [
  //   "Opium V2 Weekly ETH: Genesis", // Name
  //   "OPIUM2_LP_8866", // Symbol
  //   registryModule.address, // Registry
  //   gnosisSafe.address, // Owner
  // ])) as StakingModule;
  const stakingModule = await ethers.getContractAt<StakingModule>(
    "StakingModule",
    "0x6cec7B49E789A85B46b4701Da6C14380AD1fCAFc"
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
      "0x5A8F7A39109f0dE506F3f86562B51deB44C48aea"
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
  // await setStrategyDerivative(
  //   gnosisSafe,
  //   optionCallSellingStrategy as unknown as OptionCallSellingStrategy,
  //   derivative,
  //   deployer
  // );
  console.log("Strategy derivative is set");

  return true;
};

export default func;
func.id = "00_POLYGON";
func.tags = ["OpiumPool", "OptionCallSellingStrategy"];

// Deployed ProxyAdmin @ 0x0282f72edabbe6572d3d62358e42e8363d309758
// Deployed GnosisSafe @ 0x2c381f16ef5a11e64881b3d643fac9b0f9678d4d
// Deployed RegistryModule @ 0xb0417BE3A184889dd7ABbE933141B66D2b1e2A00
// Deployed AccountingModule @ 0xC4fE74605925a92e038dfF33D3B45A62947C0A6e
// Deployed LifecycleModule @ 0x813C0Ab2bAf256829a23422904107D4884CEba65
// Deployed StakingModule @ 0x6cec7B49E789A85B46b4701Da6C14380AD1fCAFc
// Deployed OptionCallSellingStrategy @ 0x5A8F7A39109f0dE506F3f86562B51deB44C48aea
