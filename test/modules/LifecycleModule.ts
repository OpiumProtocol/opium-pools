import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { LifecycleModule } from "../../typechain";

const EPOCH_LENGTH = 3600 * 24 * 7; // 1 week
const STAKING_LENGTH = 3600 * 4; // 4 hours
const TRADING_LENGTH = 3600 * 24 * 2; // 2 days

describe("LifecycleModule", function () {
  let lifecycleModule: LifecycleModule;
  let deployer: SignerWithAddress;
  let registryModule: SignerWithAddress;

  before(async () => {
    [deployer, registryModule] = await ethers.getSigners();
    // Deploy Lifecycle Module
    const LifecycleModule = await ethers.getContractFactory("LifecycleModule");
    lifecycleModule = await LifecycleModule.deploy(
      ~~(Date.now() / 1000) - 3600,
      [EPOCH_LENGTH, STAKING_LENGTH, TRADING_LENGTH],
      registryModule.address,
      deployer.address
    );
    await lifecycleModule.deployed();
  });

  it("should correctly return current phase", async function () {
    const isStakingPhase = await lifecycleModule.isStakingPhase();
    expect(isStakingPhase).to.be.equal(true);
  });
});
