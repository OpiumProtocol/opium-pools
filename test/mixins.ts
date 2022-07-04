import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";

import {
  GnosisSafeL2,
  GnosisSafeProxyFactory,
  RegistryModule,
  AccountingModule,
  LifecycleModule,
  StakingModule,
  OptionsSellingStrategyModule,
} from "./../typechain/";

import { decodeLogs } from "./utils/index";

export const deployGnosisSafeSingleton = async () => {
  const GnosisSafe = await ethers.getContractFactory("GnosisSafeL2");
  const gnosisSafeSingleton: GnosisSafeL2 = await GnosisSafe.deploy();
  await gnosisSafeSingleton.deployed();
  return gnosisSafeSingleton;
};

export const deployGnosisSafeFactory = async () => {
  const GnosisSafeProxyFactory = await ethers.getContractFactory(
    "GnosisSafeProxyFactory"
  );
  const gnosisSafeProxyFactory: GnosisSafeProxyFactory =
    await GnosisSafeProxyFactory.deploy();
  await gnosisSafeProxyFactory.deployed();
  return gnosisSafeProxyFactory;
};

export const deployGnosisSafe = async (
  gnosisSafeSingleton: GnosisSafeL2,
  gnosisSafeProxyFactory: GnosisSafeProxyFactory,
  owner: SignerWithAddress
) => {
  const GnosisSafe = await ethers.getContractFactory("GnosisSafeL2");

  // Prepare initializer
  const initializer = gnosisSafeSingleton.interface.encodeFunctionData(
    // @ts-ignore
    "setup",
    [
      [owner.address], // owners
      1, // threshold
      ethers.constants.AddressZero, // to (delegate call)
      "0x", // data (delegate call)
      ethers.constants.AddressZero, // fallback handler
      ethers.constants.AddressZero, // payment token
      "0", // payment
      ethers.constants.AddressZero, // payment address
    ]
  );

  const tx = await gnosisSafeProxyFactory.createProxyWithNonce(
    gnosisSafeSingleton.address,
    initializer,
    Date.now()
  );
  const receipt = await tx.wait();

  const logs = decodeLogs<GnosisSafeProxyFactory>(
    gnosisSafeProxyFactory,
    "ProxyCreation",
    receipt
  );

  const deployedSafeAddress =
    "0x" + logs[0].data.split("000000000000000000000000")[1];

  const deployedSafe = GnosisSafe.attach(deployedSafeAddress);
  return deployedSafe;
};

export const enableModule = async (
  gnosisSafe: GnosisSafeL2,
  moduleAddress: string,
  owner: SignerWithAddress
) => {
  const addModuleData = gnosisSafe.interface.encodeFunctionData(
    "enableModule",
    [moduleAddress]
  );

  await gnosisSafe.execTransaction(
    gnosisSafe.address,
    "0",
    addModuleData,
    "0",
    "0",
    "0",
    "0",
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    `0x000000000000000000000000${owner.address.substring(
      2
    )}000000000000000000000000000000000000000000000000000000000000000001`
  );
};

export const setupRegistry = async (
  gnosisSafe: GnosisSafeL2,
  registryModule: RegistryModule,
  accountingModule: AccountingModule,
  lifecycleModule: LifecycleModule,
  stakingModule: StakingModule,
  strategyModule: string,
  owner: SignerWithAddress
) => {
  const setRegistryAddressesData = registryModule.interface.encodeFunctionData(
    "setRegistryAddresses",
    [
      {
        accountingModule: accountingModule.address,
        lifecycleModule: lifecycleModule.address,
        stakingModule: stakingModule.address,
        strategyModule,
      },
    ]
  );

  await gnosisSafe.execTransaction(
    registryModule.address,
    "0",
    setRegistryAddressesData,
    "0",
    "0",
    "0",
    "0",
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    `0x000000000000000000000000${owner.address.substring(
      2
    )}000000000000000000000000000000000000000000000000000000000000000001`
  );
};

export const setStrategyAdvisor = async (
  gnosisSafe: GnosisSafeL2,
  strategyModule: OptionsSellingStrategyModule,
  advisor: SignerWithAddress,
  owner: SignerWithAddress
) => {
  const ADVISOR_ROLE = await strategyModule.ADVISOR_ROLE();
  const setAdvisorRoleData = strategyModule.interface.encodeFunctionData(
    "grantRole",
    [ADVISOR_ROLE, advisor.address]
  );

  await gnosisSafe.execTransaction(
    strategyModule.address,
    "0",
    setAdvisorRoleData,
    "0",
    "0",
    "0",
    "0",
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    `0x000000000000000000000000${owner.address.substring(
      2
    )}000000000000000000000000000000000000000000000000000000000000000001`
  );
};

export const sendArbitraryTx = async (
  gnosisSafe: GnosisSafeL2,
  target: string,
  data: string,
  owner: SignerWithAddress
) => {
  await gnosisSafe.execTransaction(
    target,
    "0",
    data,
    "0",
    "0",
    "0",
    "0",
    ethers.constants.AddressZero,
    ethers.constants.AddressZero,
    `0x000000000000000000000000${owner.address.substring(
      2
    )}000000000000000000000000000000000000000000000000000000000000000001`
  );
};
