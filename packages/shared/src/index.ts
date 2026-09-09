export {
  DeploymentAssetSchema,
  DeploymentManifestSchema,
  parseDeploymentManifest,
  safeParseDeploymentManifest,
  type DeploymentAsset,
  type DeploymentManifest,
} from "./manifest.js";

export {
  ERROR_CODES,
  GIFT_STATES,
  GIFT_TRANSITIONS,
  TERMINAL_GIFT_STATES,
  canTransitionGift,
  type ErrorCode,
  type GiftState,
} from "./errors.js";

export {
  addressSchema,
  createGiftRequestSchema,
  idempotencyKeySchema,
  recipientDescriptorSchema,
  recipientKindSchema,
  resolveRequestSchema,
  submittedGiftRequestSchema,
  uuidSchema,
  walletChallengeRequestSchema,
  walletLinkRequestSchema,
  type CreateGiftRequest,
  type RecipientDescriptor,
  type ResolveRequest,
} from "./api-schemas.js";

export {
  CLAIM_AUTHORIZATION_TYPES,
  WALLET_LINK_TYPES,
  claimAuthorizationTypedData,
  walletLinkTypedData,
  type ClaimAuthResult,
} from "./claim.js";
