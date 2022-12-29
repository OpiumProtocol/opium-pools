import { task } from "hardhat/config";

import {
  RegistryModule,
  OptionsSellingStrategy,
  IOpiumOnChainPositionsLens,
} from "../typechain";

task("maintenance:rebalance", "Maintenance: Rebalance pool")
  .addParam("registry", "Address of the pool registry")
  .setAction(async function (_taskArgs, _hre) {
    const { ethers, network } = _hre;
    const { deployer } = await ethers.getNamedSigners();
    const { registry } = _taskArgs;

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

    await (await strategyModule.rebalance()).wait();

    console.log("Pool was successfully rebalanced");
  });

task("maintenance:execute", "Maintenance: Execute pool")
  .addParam("registry", "Address of the pool registry")
  .setAction(async function (_taskArgs, _hre) {
    const { ethers, network } = _hre;
    const { deployer } = await ethers.getNamedSigners();
    const { registry } = _taskArgs;

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

    const opiumLensAddress = await strategyModule.getOpiumLens();
    const opiumLens = <IOpiumOnChainPositionsLens>(
      await ethers.getContractAt("IOpiumOnChainPositionsLens", opiumLensAddress)
    );

    console.log(`Loaded contracts:
  - Opium Lens: ${opiumLensAddress}

  - Strategy Module: ${modules.strategyModule}
`);

    const derivative = await strategyModule.getDerivative();
    console.log(`Derivative:
  - Margin: ${derivative.margin.toString()}
  - End time: ${derivative.endTime}
  - Params: ${derivative.params.map((p) => p.toString())}
  - Oracle ID: ${derivative.oracleId}
  - Token: ${derivative.token}
  - Synthetic ID: ${derivative.syntheticId}
`);

    const positionAddresses =
      await opiumLens.predictPositionsAddressesByDerivative(derivative);

    console.log(`Positions addresses:
  - Long: ${positionAddresses.longPositionAddress}
  - Short: ${positionAddresses.shortPositionAddress}
`);

    console.log(strategyModule.interface.encodeFunctionData("execute"));
    await (await strategyModule.execute()).wait();

    console.log("Pool was successfully executed");
  });
