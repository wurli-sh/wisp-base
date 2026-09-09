import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import type { Config } from "../config.js";

export function createChainClient(config: Config) {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(config.env.rpcUrl),
  });
}

export type ChainClient = ReturnType<typeof createChainClient>;
