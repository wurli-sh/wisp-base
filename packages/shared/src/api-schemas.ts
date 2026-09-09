import { z } from "zod";

export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "expected 0x-prefixed 20-byte address");

export const uuidSchema = z.string().uuid();

export const idempotencyKeySchema = uuidSchema;

export const recipientKindSchema = z.enum(["email", "x", "basename"]);

export const resolveRequestSchema = z.object({
  kind: recipientKindSchema,
  identifier: z.string().min(1).max(320),
});

export const recipientDescriptorSchema = z.object({
  version: z.literal(1),
  descriptorId: uuidSchema,
  kind: recipientKindSchema,
  registered: z.boolean(),
  recipientProfileRef: uuidSchema.nullable(),
  recipientAddress: addressSchema.nullable(),
  issuedAt: z.number().int().nonnegative(),
  validUntil: z.number().int().positive(),
  nonce: uuidSchema,
});

export const createGiftRequestSchema = z.object({
  descriptor: recipientDescriptorSchema,
  signature: z.string().min(1),
  tokenAddress: addressSchema,
  usdcAmount: z.string().regex(/^[1-9]\d*$/),
  quotedStockAmount: z.string().regex(/^\d+$/),
  unlockAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  anonymousSender: z.boolean().default(false),
  message: z.string().max(280).nullable().optional(),
});

export const submittedGiftRequestSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export const walletChallengeRequestSchema = z.object({
  address: addressSchema,
});

export const walletLinkRequestSchema = z.object({
  challengeId: uuidSchema,
  address: addressSchema,
  signature: z.string().min(1),
});

export type ResolveRequest = z.infer<typeof resolveRequestSchema>;
export type RecipientDescriptor = z.infer<typeof recipientDescriptorSchema>;
export type CreateGiftRequest = z.infer<typeof createGiftRequestSchema>;
