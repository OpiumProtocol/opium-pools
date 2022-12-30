import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import {
  GnosisSafeL2,
  RegistryModule,
  AccountingModule,
  LifecycleModule,
  StakingModule,
  OptionCallSellingStrategy,
} from "../../typechain";

import { setupRegistry, setStrategyDerivative } from "../../test/mixins";

// Strategy Constants
const GNOSIS_SAFE_SIGN_MESSAGE_LIB_ADDRESS =
  "0xA65387F16B013cf2Af4605Ad8aA5ec25a2cbA3a2";
const OPIUM_REGISTRY_ADDRESS = "0x17b6ffe276e8A4a299a5a87a656aFc5b8FA3ee4a";
const OPIUM_LENS_ADDRESS = "0x33afAaA35df82D56833B7EEacb2b65Eb805AC774";
const AUCTION_HELPER_ADDRESS = "0x06eb4bCc14b8C1664a2d4e2CdE8fA2F992332fCd";
const LIMIT_ORDER_PROTOCOL_ADDRESS =
  "0x94bc2a1c732bcad7343b25af48385fe76e08734f";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, network, ethers } = hre;
  const { deploy } = deployments;

  const [deployer] = await ethers.getSigners();

  // Skip if network is not correct
  if (network.name !== "polygon") {
    return;
  }

  /** #1: Deploy GnosisSafe */
  const gnosisSafe = await ethers.getContractAt<GnosisSafeL2>(
    "GnosisSafeL2",
    "0x2c381f16ef5a11e64881b3d643fac9b0f9678d4d"
  );
  console.log(`Deployed GnosisSafe @ ${gnosisSafe.address}`);

  /** #2: Deploy Registry */
  const registryModule = await ethers.getContractAt<RegistryModule>(
    "RegistryModule",
    "0xb0417BE3A184889dd7ABbE933141B66D2b1e2A00"
  );
  console.log(`Deployed RegistryModule @ ${registryModule.address}`);

  /** #3: Deploy AccountingModule */
  const accountingModule = await ethers.getContractAt<AccountingModule>(
    "AccountingModule",
    "0xC4fE74605925a92e038dfF33D3B45A62947C0A6e"
  );
  console.log(`Deployed AccountingModule @ ${accountingModule.address}`);

  /** #4: Deploy LifecycleModule */
  const lifecycleModule = await ethers.getContractAt<LifecycleModule>(
    "LifecycleModule",
    "0x813C0Ab2bAf256829a23422904107D4884CEba65"
  );
  console.log(`Deployed LifecycleModule @ ${lifecycleModule.address}`);

  /** #5: Deploy StakingModule */
  const stakingModule = await ethers.getContractAt<StakingModule>(
    "StakingModule",
    "0x6cec7B49E789A85B46b4701Da6C14380AD1fCAFc"
  );
  console.log(`Deployed StakingModule @ ${stakingModule.address}`);

  /** #6: Deploy StrategyModule */
  const optionCallSellingStrategy =
    await ethers.getContractAt<OptionCallSellingStrategy>(
      "OptionCallSellingStrategy",
      "0x9D40ac7d7eACAAB5bFa93c89d981CA0C357970B6"
    );
  console.log(
    `Deployed OptionCallSellingStrategy @ ${optionCallSellingStrategy.address}`
  );

  /** #7: Setup Registry */
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

  /** #9: Setup strategy */
  // eslint-disable-next-line camelcase
  // const OLD_optionCallSellingStrategy =
  //   await ethers.getContractAt<OptionCallSellingStrategy>(
  //     "OptionCallSellingStrategy",
  //     "0x5A8F7A39109f0dE506F3f86562B51deB44C48aea"
  //   );
  // const derivative = await OLD_optionCallSellingStrategy.getDerivative();
  // await (
  //   await setStrategyDerivative(
  //     gnosisSafe,
  //     optionCallSellingStrategy as unknown as OptionCallSellingStrategy,
  //     derivative,
  //     deployer
  //   )
  // ).wait();
  console.log("Strategy derivative is set");

  return true;
};

export default func;
func.id = "01_POLYGON";
func.tags = ["OpiumPool", "OptionCallSellingStrategy"];

// Deployed GnosisSafe @ 0x2c381f16ef5a11e64881b3d643fac9b0f9678d4d
// Deployed RegistryModule @ 0xb0417BE3A184889dd7ABbE933141B66D2b1e2A00
// Deployed AccountingModule @ 0xC4fE74605925a92e038dfF33D3B45A62947C0A6e
// Deployed LifecycleModule @ 0x813C0Ab2bAf256829a23422904107D4884CEba65
// Deployed StakingModule @ 0x6cec7B49E789A85B46b4701Da6C14380AD1fCAFc
// Deployed OptionCallSellingStrategy @ 0x9D40ac7d7eACAAB5bFa93c89d981CA0C357970B6
