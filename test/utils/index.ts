import { Contract, ContractReceipt } from "ethers";
import { Log } from "@ethersproject/providers";
import hardhat, { ethers } from "hardhat";

export const decodeLogs = <T extends Contract>(
  contract: T,
  eventName: string,
  receipt: ContractReceipt
): Log[] => {
  const topic = contract.interface.getEventTopic(eventName);
  return receipt.logs.filter((log) => log.topics.indexOf(topic) >= 0);
};

export const formatAddress = (address: string): string => {
  return "0x".concat(address.split("0x000000000000000000000000")[1]);
};

export const timeTravel = async (seconds: number): Promise<void> => {
  await hardhat.network.provider.send("evm_increaseTime", [seconds]);
  await hardhat.network.provider.send("evm_mine");
};

export const getCurrentTimestamp = async (): Promise<number> => {
  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);
  return block.timestamp;
};

export const takeSnapshot = async () => {
  const result = await hardhat.network.provider.send("evm_snapshot", []);
  await hardhat.network.provider.send("evm_mine");

  return result;
};

export const restoreSnapshot = async (id: any) => {
  await hardhat.network.provider.send("evm_revert", [id]);
  await hardhat.network.provider.send("evm_mine");
};
