import { task, types } from "hardhat/config";

import { RegistryModule, OptionsSellingStrategy } from "../typechain";

task("advisory:setStrikePriceDelta", "Advisory: Set strike price delta")
  .addParam("registry", "Address of the pool registry")
  .addParam("delta", "Delta to set (ex: 0.2 means 20%)", 0.2, types.float)
  .setAction(async function (_taskArgs, _hre) {
    const { ethers, network } = _hre;
    const { deployer } = await ethers.getNamedSigners();
    const { registry, delta } = _taskArgs;

    console.log(`
      Pool data
      - Pool Registry: ${registry}
      - Chain: ${network.name}
    `);

    /** Load modules */
    const registryModule = <RegistryModule>(
      await ethers.getContractAt("RegistryModule", registry)
    );

    const modules = await registryModule.getRegistryAddresses();

    const strategyModule = <OptionsSellingStrategy>(
      await ethers.getContractAt(
        "OptionsSellingStrategy",
        modules.strategyModule
      )
    );

    const currentDelta = await strategyModule.strikePriceDelta();
    const newDelta = await ethers.utils.parseEther(delta.toString());

    console.log(`
      Current Delta: ${ethers.utils.formatEther(currentDelta)}
      New Delta: ${ethers.utils.formatEther(newDelta)}
    `);

    await (await strategyModule.setStrikePriceDelta(newDelta)).wait();

    console.log("New Delta was successfully set");
  });
