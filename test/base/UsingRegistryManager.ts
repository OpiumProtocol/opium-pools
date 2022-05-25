import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { UsingRegistryManager } from "../../typechain";

describe("UsingRegistryManager", function () {
  let usingRegistryManager: UsingRegistryManager;
  let deployer: SignerWithAddress;
  let registryModule: SignerWithAddress;
  let newRegistryModule: SignerWithAddress;

  before(async () => {
    [deployer, registryModule, newRegistryModule] = await ethers.getSigners();
    // Deploy UsingRegistryManager
    const UsingRegistryManager = await ethers.getContractFactory(
      "UsingRegistryManager"
    );
    usingRegistryManager = await UsingRegistryManager.deploy(
      registryModule.address,
      deployer.address
    );
    await usingRegistryManager.deployed();
  });

  it("should correctly have initial value and change registry module", async function () {
    const currentRegistryModuleAddress =
      await usingRegistryManager.getRegistryModule();
    expect(currentRegistryModuleAddress).to.be.equal(registryModule.address);

    await usingRegistryManager.setRegistryModule(newRegistryModule.address);

    const newRegistryModuleAddress =
      await usingRegistryManager.getRegistryModule();
    expect(newRegistryModuleAddress).to.be.equal(newRegistryModule.address);
  });

  it("should correctly revert on unauthorized access or wrong input", async () => {
    await expect(
      usingRegistryManager
        .connect(registryModule)
        .setRegistryModule(registryModule.address)
    ).to.be.revertedWith("SM1");
    await expect(
      usingRegistryManager.setRegistryModule(ethers.constants.AddressZero)
    ).to.be.revertedWith("RM1");
  });
});
