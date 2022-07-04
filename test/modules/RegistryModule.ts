import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import {
  deployRegistryModuleSingleton,
  deployModuleProxyFactory,
  deployRegistryModule,
} from "../mixins";

import { RegistryModule } from "./../../typechain/";

describe("RegistryModule", function () {
  let registryModule: RegistryModule;
  let deployer: SignerWithAddress;
  let accountingModule: SignerWithAddress;
  let lifecycleModule: SignerWithAddress;
  let stakingModule: SignerWithAddress;
  let strategyModule: SignerWithAddress;

  before(async () => {
    [
      deployer,
      accountingModule,
      lifecycleModule,
      stakingModule,
      strategyModule,
    ] = await ethers.getSigners();

    // Deploy Registry Module
    const registryModuleSingleton = await deployRegistryModuleSingleton();
    const moduleProxyFactory = await deployModuleProxyFactory();
    registryModule = await deployRegistryModule(
      registryModuleSingleton,
      moduleProxyFactory,
      deployer.address
    );
  });

  it("should correctly set registry addresses", async function () {
    const registryAddressesBefore = await registryModule.getRegistryAddresses();
    expect(registryAddressesBefore.accountingModule).to.equal(
      ethers.constants.AddressZero
    );
    expect(registryAddressesBefore.lifecycleModule).to.equal(
      ethers.constants.AddressZero
    );
    expect(registryAddressesBefore.stakingModule).to.equal(
      ethers.constants.AddressZero
    );

    await registryModule.setRegistryAddresses({
      accountingModule: accountingModule.address,
      lifecycleModule: lifecycleModule.address,
      stakingModule: stakingModule.address,
      strategyModule: strategyModule.address,
    });

    const registryAddressesAfter = await registryModule.getRegistryAddresses();
    expect(registryAddressesAfter.accountingModule).to.equal(
      accountingModule.address
    );
    expect(registryAddressesAfter.lifecycleModule).to.equal(
      lifecycleModule.address
    );
    expect(registryAddressesAfter.stakingModule).to.equal(
      stakingModule.address
    );
  });

  it("should revert on incorrect addresses and unauthorized access", async () => {
    // Incorrect address
    await expect(
      registryModule.setRegistryAddresses({
        accountingModule: ethers.constants.AddressZero,
        lifecycleModule: lifecycleModule.address,
        stakingModule: stakingModule.address,
        strategyModule: strategyModule.address,
      })
    ).to.be.revertedWith("R5");
    await expect(
      registryModule.setRegistryAddresses({
        accountingModule: accountingModule.address,
        lifecycleModule: ethers.constants.AddressZero,
        stakingModule: stakingModule.address,
        strategyModule: strategyModule.address,
      })
    ).to.be.revertedWith("R5");
    await expect(
      registryModule.setRegistryAddresses({
        accountingModule: accountingModule.address,
        lifecycleModule: lifecycleModule.address,
        stakingModule: ethers.constants.AddressZero,
        strategyModule: strategyModule.address,
      })
    ).to.be.revertedWith("R5");
    await expect(
      registryModule.setRegistryAddresses({
        accountingModule: accountingModule.address,
        lifecycleModule: lifecycleModule.address,
        stakingModule: stakingModule.address,
        strategyModule: ethers.constants.AddressZero,
      })
    ).to.be.revertedWith("R5");

    // Unauthorized access
    await expect(
      registryModule.connect(accountingModule).setRegistryAddresses({
        accountingModule: accountingModule.address,
        lifecycleModule: lifecycleModule.address,
        stakingModule: stakingModule.address,
        strategyModule: strategyModule.address,
      })
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
});
