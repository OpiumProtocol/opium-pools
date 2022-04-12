import { Contract, ContractReceipt } from "ethers";
import { Log } from "@ethersproject/providers";
import hardhat from "hardhat";

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
