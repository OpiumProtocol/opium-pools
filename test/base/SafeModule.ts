import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { SafeModule } from "../../typechain";

describe("SafeModule", function () {
  let safeModule: SafeModule;
  let deployer: SignerWithAddress;
  let newExecutor: SignerWithAddress;

  before(async () => {
    [deployer, newExecutor] = await ethers.getSigners();
    // Deploy SafeModule
    const SafeModule = await ethers.getContractFactory("SafeModule");
    safeModule = await SafeModule.deploy(deployer.address);
    await safeModule.deployed();
  });

  it("should correctly have initial value and change registry module", async function () {
    const currentExecutorAddress = await safeModule.getExecutor();
    expect(currentExecutorAddress).to.be.equal(deployer.address);

    await safeModule.setExecutor(newExecutor.address);

    const newExecutorAddress = await safeModule.getExecutor();
    expect(newExecutorAddress).to.be.equal(newExecutor.address);
  });

  it("should correctly revert on unauthorized access or wrong input", async () => {
    await expect(
      safeModule.connect(deployer).setExecutor(deployer.address)
    ).to.be.revertedWith("SM1");
    await expect(
      safeModule.connect(newExecutor).setExecutor(ethers.constants.AddressZero)
    ).to.be.revertedWith("SM2");
  });
});
