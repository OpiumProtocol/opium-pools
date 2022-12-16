import { task, types } from "hardhat/config";
import { VoidSigner } from "ethers";
import {
  buildAuctionOrder,
  AuctionPricingFunction,
  AuctionPricingDirection,
  EthersSignerConnector,
} from "@opiumteam/opium-auction-v2-utils";

import {
  LimitOrderBuilder,
  LimitOrderProtocolFacade,
  ChainId,
} from "@1inch/limit-order-protocol";

import {
  RegistryModule,
  LifecycleModule,
  OptionsSellingStrategy,
} from "../typechain";

const CHAIN_ID_MAP = {
  polygon: 137,
};

task("auctions:launch", "Auctions: Launch auction in the pool strategy")
  .addParam("registry", "Address of the pool registry to run auctions for")
  .addParam("mint", "Whether mint is required", true, types.boolean)
  .setAction(async function (_taskArgs, _hre) {
    const { ethers, network } = _hre;
    const { deployer } = await ethers.getNamedSigners();
    const { registry } = _taskArgs;

    if (!CHAIN_ID_MAP[network.name as never]) {
      console.error("Error: Chain support not implemented yet");
      return;
    }

    console.log(`
      Starting auctions launch
      - Pool Registry: ${registry}
      - Chain: ${network.name}
    `);

    /** Load modules */
    const registryModule = <RegistryModule>(
      await ethers.getContractAt("RegistryModule", registry)
    );

    const modules = await registryModule.getRegistryAddresses();

    const lifecycleModule = <LifecycleModule>(
      await ethers.getContractAt("LifecycleModule", modules.lifecycleModule)
    );

    const strategyModule = <OptionsSellingStrategy>(
      await ethers.getContractAt(
        "OptionsSellingStrategy",
        modules.strategyModule
      )
    );

    const vaultAddress = await registryModule.avatar();

    const opiumLensAddress = await strategyModule.getOpiumLens();
    const limitOrderProtocolAddress = await strategyModule.limitOrderProtocol();
    const auctionHelperAddress = await strategyModule.auctionHelperContract();

    const opiumLens = await ethers.getContractAt(
      "IOpiumOnChainPositionsLens",
      opiumLensAddress
    );

    console.log(`
        Loaded contracts:
        - Opium Lens: ${opiumLens.address}

        Loaded modules:
        - Lifecycle: ${lifecycleModule.address}
        - Strategy: ${strategyModule.address}
    `);

    /** Mint */
    console.log("Minting positions...");
    await (await strategyModule.mint()).wait();
    console.log("Positions minted");

    /** Start Auction */
    const derivative = await strategyModule.getDerivative();
    const positionAddresses =
      await opiumLens.predictPositionsAddressesByDerivative(derivative);

    const BASE = ethers.utils.parseEther("1");
    const availableQuantity = await strategyModule.availableQuantity();
    const auctionMinPrice = await strategyModule.auctionMinPrice();
    const auctionMaxPrice = await strategyModule.auctionMaxPrice();

    const tx = await strategyModule.startAuction();
    const receipt = await tx.wait();
    const event = receipt.events?.find(
      (event) => event.event === "AuctionStarted"
    );
    const startedAt = event?.args?.auctionOrder.startedAt.toNumber();
    const endedAt = event?.args?.auctionOrder.endedAt.toNumber();

    const epochId = await lifecycleModule.getEpochId();

    console.log("Auction has started with params:", event?.args?.auctionOrder);

    /** Execute */
    // Signers preparation
    const randomProviderConnector = new EthersSignerConnector(
      deployer as unknown as VoidSigner
    );
    const randomLimitOrderBuilder = new LimitOrderBuilder(
      limitOrderProtocolAddress,
      CHAIN_ID_MAP[network.name as never] as ChainId,
      randomProviderConnector,
      () => epochId.toString()
    );
    const auctionOrder = buildAuctionOrder(
      auctionHelperAddress,
      randomLimitOrderBuilder,
      {
        makerAssetAddress: positionAddresses.longPositionAddress,
        takerAssetAddress: derivative.token,
        makerAddress: vaultAddress,
        makerAmount: availableQuantity.toString(),
        nonce: 0,
      },
      {
        pricingFunction: AuctionPricingFunction.EXPONENTIAL,
        pricingDirection: AuctionPricingDirection.DECREASING,
        partialFill: true,
        minTakerAmount: availableQuantity
          .mul(auctionMinPrice)
          .div(BASE)
          .toString(),
        maxTakerAmount: availableQuantity
          .mul(auctionMaxPrice)
          .div(BASE)
          .toString(),
        startedAt: startedAt,
        endedAt: endedAt,
        amplifier: 10,
      }
    );

    const TOTAL_PREMIUM = availableQuantity.mul(auctionMaxPrice).div(BASE);

    const randomLimitOrderProtocolFacade = new LimitOrderProtocolFacade(
      limitOrderProtocolAddress,
      randomProviderConnector
    );

    const callData = randomLimitOrderProtocolFacade.fillLimitOrder(
      auctionOrder,
      "0x",
      availableQuantity.toString(),
      "0",
      TOTAL_PREMIUM.toString()
    );
    console.log(`
      Tx #1: Approve token
        Token: ${derivative.token}
        Spender: ${limitOrderProtocolAddress}
        Amount: ${TOTAL_PREMIUM}
    `);
    console.log(`
      Tx #2: Fill order
        Address: ${limitOrderProtocolAddress}
        Calldata: ${callData}
    `);
  });
