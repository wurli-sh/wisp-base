import { parseAbi } from "viem";

export const escrowAbi = parseAbi([
  "function getGift(uint256 giftId) view returns (address token, address sender, uint128 amount, uint64 unlockAt, uint64 expiresAt, uint8 status)",
  "function claimAuthorizationDigest(uint256 giftId, address recipient, uint64 deadline) view returns (bytes32)",
  "event GiftCreated(uint256 indexed giftId, address indexed sender, address indexed token, uint256 amount, uint64 unlockAt, uint64 expiresAt)",
  "event GiftClaimed(uint256 indexed giftId, address indexed recipient)",
  "event GiftRefunded(uint256 indexed giftId, address indexed sender)",
]);

export const registryAbi = parseAbi([
  "function quoteStockAmount(address token, uint256 usdcAmount) view returns (uint256)",
  "function isEnabled(address token) view returns (bool)",
]);

export const routerAbi = parseAbi([
  "function buyAndGift(address stock, uint256 usdcAmount, uint256 minStockAmount, uint64 unlockAt, uint64 expiresAt) returns (uint256 giftId, uint256 stockAmount)",
]);

export const erc1271Abi = parseAbi([
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
]);

/** Onchain GiftStatus enum: None=0, Funded=1, Claimed=2, Refunded=3 */
export const OnchainGiftStatus = {
  None: 0,
  Funded: 1,
  Claimed: 2,
  Refunded: 3,
} as const;
