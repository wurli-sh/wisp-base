import { getAddress } from "viem";
import type { ChainClient } from "../chain/client.js";

export interface BasenameResolver {
  resolve(name: string): Promise<`0x${string}`>;
}

export class ViemBasenameResolver implements BasenameResolver {
  constructor(private readonly client: ChainClient) {}

  async resolve(name: string): Promise<`0x${string}`> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("invalid_identifier");
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      throw new Error("invalid_identifier");
    }
    const ensName = trimmed.toLowerCase().endsWith(".base.eth")
      ? trimmed.toLowerCase()
      : trimmed.toLowerCase().endsWith(".eth")
        ? trimmed.toLowerCase()
        : `${trimmed.toLowerCase()}.base.eth`;

    let address: `0x${string}` | null;
    try {
      address = await this.client.getEnsAddress({ name: ensName });
    } catch {
      throw new Error("basename_not_found");
    }
    if (!address) throw new Error("basename_not_found");
    return getAddress(address);
  }
}
