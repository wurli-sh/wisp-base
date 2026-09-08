import { z } from "zod";

const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "expected 0x-prefixed 20-byte address")
  .refine(
    (address) => !/^0x0{40}$/i.test(address),
    "zero address is not a deployment address",
  );

const txHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "expected 0x-prefixed 32-byte tx hash");

const assetKeySchema = z.enum(["WISPAAPL", "WISPNVDA", "WISPTSLA"]);

export const DeploymentAssetSchema = z.object({
  key: assetKeySchema,
  name: z.string().min(1),
  symbol: z.string().min(1),
  address: addressSchema,
  decimals: z.literal(18),
  usdPriceE6: z.string().regex(/^[1-9]\d*$/, "expected a positive integer"),
  priceAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  testOnly: z.literal(true),
});

export const DeploymentManifestSchema = z
  .object({
    version: z.literal(1),
    network: z.literal("base-sepolia"),
    chainId: z.literal(84532),
    deploymentBlock: z.number().int().positive(),
    deployer: addressSchema,
    deployedAt: z.string().datetime({ offset: true }),
    contracts: z.object({
      mockUsdc: addressSchema,
      assetRegistry: addressSchema,
      giftEscrow: addressSchema,
      demoStockRouter: addressSchema,
    }),
    claimSigner: addressSchema,
    treasury: addressSchema,
    faucet: z.object({
      maxAmount: z.string().regex(/^[1-9]\d*$/, "expected a positive integer"),
      cooldownSeconds: z.number().int().positive(),
    }),
    assets: z.array(DeploymentAssetSchema).length(3),
    transactions: z.object({
      deploy: z.array(txHashSchema).min(1),
      seedInventory: txHashSchema,
    }),
  })
  .superRefine((manifest, ctx) => {
    const requiredKeys = new Set<z.infer<typeof assetKeySchema>>([
      "WISPAAPL",
      "WISPNVDA",
      "WISPTSLA",
    ]);
    const seenKeys = new Set(manifest.assets.map((asset) => asset.key));
    if (seenKeys.size !== requiredKeys.size || [...requiredKeys].some((key) => !seenKeys.has(key))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assets"],
        message: "assets must contain WISPAAPL, WISPNVDA, and WISPTSLA exactly once",
      });
    }

    const deploymentAddresses = [
      ...Object.values(manifest.contracts),
      ...manifest.assets.map((asset) => asset.address),
    ].map((address) => address.toLowerCase());
    if (new Set(deploymentAddresses).size !== deploymentAddresses.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contracts"],
        message: "core contracts and assets must use distinct addresses",
      });
    }
  });

export type DeploymentManifest = z.infer<typeof DeploymentManifestSchema>;
export type DeploymentAsset = z.infer<typeof DeploymentAssetSchema>;

export function parseDeploymentManifest(input: unknown): DeploymentManifest {
  return DeploymentManifestSchema.parse(input);
}

export function safeParseDeploymentManifest(input: unknown) {
  return DeploymentManifestSchema.safeParse(input);
}
