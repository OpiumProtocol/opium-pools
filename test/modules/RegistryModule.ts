import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

import { RegistryModule } from "./../../typechain/";

describe("RegistryModule", function () {
  let registryModule: RegistryModule;
  let deployer: SignerWithAddress;
  let accountingModule: SignerWithAddress;
  let lifecycleModule: SignerWithAddress;
  let stakingModule: SignerWithAddress;
  let strategyOne: SignerWithAddress;
  let strategyTwo: SignerWithAddress;

  before(async () => {
    [
      deployer,
      accountingModule,
      lifecycleModule,
      stakingModule,
      strategyOne,
      strategyTwo,
    ] = await ethers.getSigners();
    // Deploy Registry Module
    const RegistryModule = await ethers.getContractFactory("RegistryModule");
    registryModule = <RegistryModule>(
      await upgrades.deployProxy(RegistryModule, [deployer.address])
    );
    await registryModule.deployed();
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
      })
    ).to.be.revertedWith("R1");
    await expect(
      registryModule.setRegistryAddresses({
        accountingModule: accountingModule.address,
        lifecycleModule: ethers.constants.AddressZero,
        stakingModule: stakingModule.address,
      })
    ).to.be.revertedWith("R1");
    await expect(
      registryModule.setRegistryAddresses({
        accountingModule: accountingModule.address,
        lifecycleModule: lifecycleModule.address,
        stakingModule: ethers.constants.AddressZero,
      })
    ).to.be.revertedWith("R1");

    // Unauthorized access
    await expect(
      registryModule.connect(accountingModule).setRegistryAddresses({
        accountingModule: accountingModule.address,
        lifecycleModule: lifecycleModule.address,
        stakingModule: ethers.constants.AddressZero,
      })
    ).to.be.revertedWith("SM1");
  });

  it("should correctly enable / disable strategies and prevent unauthorized access", async () => {
    // Enable strategies
    const isStrategyOneEnabledBefore = await registryModule.isStrategyEnabled(
      strategyOne.address
    );
    expect(isStrategyOneEnabledBefore).to.be.equal(false);

    await expect(
      registryModule.connect(strategyOne).enableStrategy(strategyOne.address)
    ).to.be.revertedWith("SM1");
    await registryModule.enableStrategy(strategyOne.address);

    const isStrategyOneEnabledAfter = await registryModule.isStrategyEnabled(
      strategyOne.address
    );
    expect(isStrategyOneEnabledAfter).to.be.equal(true);

    const isStrategyTwoEnabledBefore = await registryModule.isStrategyEnabled(
      strategyTwo.address
    );
    expect(isStrategyTwoEnabledBefore).to.be.equal(false);

    await registryModule.enableStrategy(strategyTwo.address);

    const isStrategyTwoEnabledAfter = await registryModule.isStrategyEnabled(
      strategyTwo.address
    );
    expect(isStrategyTwoEnabledAfter).to.be.equal(true);

    const enabledStrategiesBefore = await registryModule.getEnabledStrategies();
    expect(
      enabledStrategiesBefore.map((a) => a.toLowerCase()).sort()
    ).to.be.eql(
      [strategyOne.address, strategyTwo.address]
        .map((a) => a.toLowerCase())
        .sort()
    );

    // Disable strategies
    await expect(
      registryModule.connect(strategyOne).disableStrategy(strategyOne.address)
    ).to.be.revertedWith("SM1");
    await registryModule.disableStrategy(strategyOne.address);

    const isStrategyOneEnabledFinal = await registryModule.isStrategyEnabled(
      strategyOne.address
    );
    expect(isStrategyOneEnabledFinal).to.be.equal(false);

    await registryModule.disableStrategy(strategyTwo.address);

    const isStrategyTwoEnabledFinal = await registryModule.isStrategyEnabled(
      strategyTwo.address
    );
    expect(isStrategyTwoEnabledFinal).to.be.equal(false);

    const enabledStrategiesAfter = await registryModule.getEnabledStrategies();
    expect(enabledStrategiesAfter).to.be.eql([]);
  });
});
