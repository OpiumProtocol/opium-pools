import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder } from "ethers/lib/utils";

import {
  deployGnosisSafeSingleton,
  deployGnosisSafeFactory,
  deployGnosisSafe,
  enableModule,
  deployRegistryModuleSingleton,
  deployModuleProxyFactory,
  deployRegistryModule,
} from "../mixins";

import { RegistryModule } from "./../../typechain/";

// Gnosis Safe Utils
const GNOSIS_SAFE_FALLBACK_HANDLER =
  "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4";

describe("RegistryModule", function () {
  let registryModuleSingleton: RegistryModule;
  let registryModule: RegistryModule;
  let deployer: SignerWithAddress;
  let accountingModule: SignerWithAddress;
  let lifecycleModule: SignerWithAddress;
  let stakingModule: SignerWithAddress;
  let strategyModule: SignerWithAddress;
  let newOwner: SignerWithAddress;

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
      GNOSIS_SAFE_FALLBACK_HANDLER,
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
});
