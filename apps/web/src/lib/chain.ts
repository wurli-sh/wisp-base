import {
  type Address,
  type Hex,
  createPublicClient,
  http,
  parseAbi,
} from "viem";
import { baseSepolia } from "viem/chains";
import { z } from "zod";

export const CHAIN_ID = 84532;
export const CHAIN = baseSepolia;

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org"),
});

export const mockUsdcAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function faucet(address to, uint256 amount)",
  "function faucetMax() view returns (uint256)",
  "function faucetCooldown(address account) view returns (uint64)",
  "function nonces(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);

export const routerAbi = parseAbi([
  "function buyAndGift(address stock, uint256 usdcAmount, uint256 minStockAmount, uint64 unlockAt, uint64 expiresAt) returns (uint256 giftId, uint256 stockAmount)",
  "function buyAndGiftWithPermit(address stock, uint256 usdcAmount, uint256 minStockAmount, uint64 unlockAt, uint64 expiresAt, uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s) returns (uint256 giftId, uint256 stockAmount)",
]);

export const escrowAbi = parseAbi([
  "function getGift(uint256 giftId) view returns (address token, address sender, uint128 amount, uint64 unlockAt, uint64 expiresAt, uint8 status)",
  "function claim(uint256 giftId, address recipient, uint64 authorizationDeadline, bytes authorization)",
  "function refund(uint256 giftId)",
]);

export const registryAbi = parseAbi([
  "function quoteStockAmount(address token, uint256 usdcAmount) view returns (uint256)",
  "function isEnabled(address token) view returns (bool)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const deploymentSchema = z.object({
  version: z.literal(1),
  network: z.literal("base-sepolia"),
  chainId: z.literal(84532),
  contracts: z.object({
    mockUsdc: addressSchema,
    assetRegistry: addressSchema,
    giftEscrow: addressSchema,
    demoStockRouter: addressSchema,
  }),
  faucet: z.object({
    maxAmount: z.string(),
    cooldownSeconds: z.number(),
  }),
  assets: z.array(
    z.object({
      key: z.enum(["WISPAAPL", "WISPNVDA", "WISPTSLA"]),
      name: z.string(),
      symbol: z.string(),
      address: addressSchema,
      decimals: z.number(),
      usdPriceE6: z.string(),
      priceAsOf: z.string().optional(),
      testOnly: z.boolean().optional(),
    }),
  ),
});

export type DeploymentManifest = z.infer<typeof deploymentSchema>;

let cachedManifest: DeploymentManifest | null = null;

export async function loadDeployment(): Promise<DeploymentManifest> {
  if (cachedManifest) return cachedManifest;
  const res = await fetch("/deployments/base-sepolia.json", { cache: "force-cache" });
  if (!res.ok) throw new Error("deployment_unavailable");
  cachedManifest = deploymentSchema.parse(await res.json());
  return cachedManifest;
}

export function contractAddresses(m: DeploymentManifest) {
  return {
    mockUsdc: m.contracts.mockUsdc as Address,
    assetRegistry: m.contracts.assetRegistry as Address,
    giftEscrow: m.contracts.giftEscrow as Address,
    demoStockRouter: m.contracts.demoStockRouter as Address,
  };
}

export type TxRequest = {
  to: Address;
  data?: Hex;
  value?: bigint;
};
