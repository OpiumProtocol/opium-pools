import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { AbiCoder } from "ethers/lib/utils";

import {
  deployGnosisSafeSingleton,
  deployGnosisSafeFactory,
  deployGnosisSafe,
  enableModule,
  deployRegistryModuleSingleton,
  deployModuleProxyFactory,
  deployRegistryModule,
  struct,
} from "../mixins";

import { RegistryModule, PoolsLens } from "./../../typechain/";

describe("RegistryModule", function () {
  let registryModuleSingleton: RegistryModule;
  let registryModule: RegistryModule;
  let deployer: SignerWithAddress;
  let accountingModule: SignerWithAddress;
  let lifecycleModule: SignerWithAddress;
  let stakingModule: SignerWithAddress;
  let strategyModule: SignerWithAddress;
  let newOwner: SignerWithAddress;
  let poolsLens: PoolsLens;


  before(async () => {
    [
      deployer,
      accountingModule,
      lifecycleModule,
      stakingModule,
      strategyModule,
      newOwner,
    ] = await ethers.getSigners();

    // Deploy Registry Module
    registryModuleSingleton = await deployRegistryModuleSingleton();
    const moduleProxyFactory = await deployModuleProxyFactory();
    registryModule = await deployRegistryModule(
      registryModuleSingleton,
      moduleProxyFactory,
      deployer.address
    );

    // Deploy Lens Contract
    const PoolsLens = await ethers.getContractFactory("PoolsLens");
    poolsLens = <PoolsLens>await upgrades.deployProxy(PoolsLens);
    await poolsLens.deployed();
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
    ).to.be.revertedWith("R6");
    await expect(
      registryModule.setRegistryAddresses({
        accountingModule: accountingModule.address,
        lifecycleModule: ethers.constants.AddressZero,
        stakingModule: stakingModule.address,
        strategyModule: strategyModule.address,
      })
    ).to.be.revertedWith("R6");
    await expect(
      registryModule.setRegistryAddresses({
        accountingModule: accountingModule.address,
        lifecycleModule: lifecycleModule.address,
        stakingModule: ethers.constants.AddressZero,
        strategyModule: strategyModule.address,
      })
    ).to.be.revertedWith("R6");
    await expect(
      registryModule.setRegistryAddresses({
        accountingModule: accountingModule.address,
        lifecycleModule: lifecycleModule.address,
        stakingModule: stakingModule.address,
        strategyModule: ethers.constants.AddressZero,
      })
    ).to.be.revertedWith("R6");

    const initializerParamsA = new AbiCoder().encode(
      ["address", "address", "address"],
      [ethers.constants.AddressZero, deployer.address, deployer.address]
    );
    await expect(
      registryModuleSingleton.setUp(initializerParamsA)
    ).to.be.revertedWith("R1");

    const initializerParamsB = new AbiCoder().encode(
      ["address", "address", "address"],
      [deployer.address, ethers.constants.AddressZero, deployer.address]
    );
    await expect(
      registryModuleSingleton.setUp(initializerParamsB)
    ).to.be.revertedWith("R2");

    const initializerParamsC = new AbiCoder().encode(
      ["address", "address", "address"],
      [deployer.address, deployer.address, ethers.constants.AddressZero]
    );
    await expect(
      registryModuleSingleton.setUp(initializerParamsC)
    ).to.be.revertedWith("R3");

    // Unauthorized access
    await expect(
      registryModule.connect(accountingModule).setRegistryAddresses({
        accountingModule: accountingModule.address,
        lifecycleModule: lifecycleModule.address,
        stakingModule: stakingModule.address,
        strategyModule: strategyModule.address,
      })
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      registryModule
        .connect(lifecycleModule)
        .executeOnVault(lifecycleModule.address, "0x")
    ).to.be.revertedWith("R4");
  });

  it("should revert wrong and settle correct transactions", async () => {
    // Setup GnosisSafe
    const gnosisSafeSingleton = await deployGnosisSafeSingleton();
    const gnosisSafeProxyFactory = await deployGnosisSafeFactory();
    const gnosisSafe = await deployGnosisSafe(
      gnosisSafeSingleton,
      gnosisSafeProxyFactory,
      deployer
    );

    await registryModule.setTarget(gnosisSafe.address);
    await registryModule.transferOwnership(gnosisSafe.address);
    await enableModule(gnosisSafe, registryModule.address, deployer);

    // Incorrect tx
    await expect(
      registryModule
        .connect(strategyModule)
        .executeOnVault(registryModule.address, "0x")
    ).to.be.revertedWith("R5");

    // Correct tx
    registryModule
      .connect(strategyModule)
      .executeOnVault(
        registryModule.address,
        registryModule.interface.encodeFunctionData("transferOwnership", [
          newOwner.address,
        ])
      );
    expect(await registryModule.owner()).to.be.equal(newOwner.address);
  });


  // Pools Lens tests
  it("should receive modules addresses", async () => {
    const {
      stakingAddress,
      accountingAddress,
      lifecycleAddress,
      vaultAddress,
      strategyAddress,
    } = struct(await poolsLens.getPoolModules(registryModule.address));
    expect(stakingAddress).to.be.equal(stakingModule.address);
    expect(accountingAddress).to.be.equal(accountingModule.address);
    expect(lifecycleAddress).to.be.equal(lifecycleModule.address);
    expect(vaultAddress).to.be.equal("");
    expect(strategyAddress).to.be.equal(stakingModule.address);
  });

  it("should return Accounting data", async () => {
    const {
      poolSize,
      poolUtilization,
      managementFee,
      performanceFee,
      marginDecimals,
      marginAddress,
      marginTitle,
    } = struct(await poolsLens.getAccountingData(accountingModule.address));
  });

  it("should return Staking data", async () => {
    const {
      pendingStake,
      pendingWithdrawal,
      userStaked,
      claimableAssets,
      claimableShares,
    } = struct(
      await poolsLens.getStakingData(
        stakingModule.address,
        lifecycleModule.address
      )
    );
  });

  it("should return Lifecycle data", async () => {
    const {
      currentEpochTimestamp,
      currentEpochStarted,
      phasesLength,
      isStakingPhase,
      isTradingPhase,
      isIdlePhase,
    } = struct(await poolsLens.getLifecycleData(lifecycleModule.address));
  });
});
