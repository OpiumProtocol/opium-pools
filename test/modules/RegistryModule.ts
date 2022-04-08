import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { RegistryModule } from "./../../typechain/";

describe("RegistryModule", function () {
  let registryModule: RegistryModule;
  let deployer: SignerWithAddress;
  let accountingModule: SignerWithAddress;
  let lifecycleModule: SignerWithAddress;
  let stakingModule: SignerWithAddress;

  before(async () => {
    [deployer, accountingModule, lifecycleModule, stakingModule] = await ethers.getSigners();
    // Deploy Registry Module
    const RegistryModule = await ethers.getContractFactory("RegistryModule");
    registryModule = await RegistryModule.deploy(deployer.address);
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
  });
});
