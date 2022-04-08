import { Contract, ContractReceipt } from "ethers";
import { Log } from "@ethersproject/providers";

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
