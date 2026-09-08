import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { auditPhase1 } from "./audit-phase1.mjs";

const mockUsdcAbi = parseAbi([
  "function faucet(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function FAUCET_MAX() view returns (uint256)",
  "function faucetCooldown(address) view returns (uint64)",
]);

const registryAbi = parseAbi([
  "function quoteStockAmount(address token, uint256 usdcAmount) view returns (uint256)",
]);

const routerAbi = parseAbi([
  "function buyAndGift(address stock, uint256 usdcAmount, uint256 minStockAmount, uint64 unlockAt, uint64 expiresAt) returns (uint256 giftId, uint256 stockAmount)",
]);

const escrowAbi = parseAbi([
  "event GiftCreated(uint256 indexed giftId, address indexed sender, address indexed token, uint256 amount, uint64 unlockAt, uint64 expiresAt)",
  "event GiftClaimed(uint256 indexed giftId, address indexed recipient)",
  "event GiftRefunded(uint256 indexed giftId, address indexed sender)",
  "function claim(uint256 giftId, address recipient, uint64 authorizationDeadline, bytes authorization)",
  "function createGift(address token, uint256 amount, uint64 unlockAt, uint64 expiresAt) returns (uint256 giftId)",
  "function refund(uint256 giftId)",
  "function claimAuthorizationDigest(uint256 giftId, address recipient, uint64 deadline) view returns (bytes32)",
  "function getGift(uint256 giftId) view returns ((address token, address sender, uint128 amount, uint64 unlockAt, uint64 expiresAt, uint8 status))",
  "function lockedByToken(address token) view returns (uint256)",
]);

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

export async function runContractsSmoke({ root, manifest }) {
  loadEnv(resolve(root, ".env"));
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY required for smoke");

  const deployer = privateKeyToAccount(normalizePk(process.env.DEPLOYER_PRIVATE_KEY));
  const authorizer = privateKeyToAccount(normalizePk(
    process.env.CLAIM_AUTHORIZER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY,
  ));
  if (getAddress(authorizer.address) !== getAddress(manifest.claimSigner)) {
    throw new Error(`claim authorizer derives ${authorizer.address}, manifest requires ${manifest.claimSigner}`);
  }
  if (getAddress(deployer.address) !== getAddress(manifest.deployer)) {
    throw new Error(`deployer key derives ${deployer.address}, manifest requires ${manifest.deployer}`);
  }

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account: deployer, chain: baseSepolia, transport: http(rpcUrl) });
  const audit = await auditPhase1({ client: publicClient, manifest, verifyTransactions: true });

  const stock = manifest.assets[0];
  const usdc = manifest.contracts.mockUsdc;
  const registry = manifest.contracts.assetRegistry;
  const router = manifest.contracts.demoStockRouter;
  const escrow = manifest.contracts.giftEscrow;
  const usdcAmount = 1_000_000n;
  const stockAmount = await publicClient.readContract({
    address: registry,
    abi: registryAbi,
    functionName: "quoteStockAmount",
    args: [stock.address, usdcAmount],
  });
  if (stockAmount === 0n) throw new Error("registry returned a zero stock quote");

  let faucetHash = null;
  const usdcBalance = await publicClient.readContract({
    address: usdc,
    abi: mockUsdcAbi,
    functionName: "balanceOf",
    args: [deployer.address],
  });
  if (usdcBalance < usdcAmount) {
    const [faucetMax, readyAt, block] = await Promise.all([
      publicClient.readContract({ address: usdc, abi: mockUsdcAbi, functionName: "FAUCET_MAX" }),
      publicClient.readContract({ address: usdc, abi: mockUsdcAbi, functionName: "faucetCooldown", args: [deployer.address] }),
      publicClient.getBlock(),
    ]);
    if (readyAt !== 0 && block.timestamp < readyAt) {
      throw new Error(`tUSDC balance is low and faucet cooldown remains active until ${readyAt}`);
    }
    console.log("smoke: faucet tUSDC");
    faucetHash = await wallet.writeContract({
      address: usdc,
      abi: mockUsdcAbi,
      functionName: "faucet",
      args: [deployer.address, faucetMax],
    });
    await expectSuccess(publicClient, faucetHash, "faucet");
  } else {
    console.log("smoke: existing tUSDC balance is sufficient; faucet skipped");
  }

  console.log("smoke: approve and buy gift");
  const approveHash = await wallet.writeContract({
    address: usdc,
    abi: mockUsdcAbi,
    functionName: "approve",
    args: [router, usdcAmount],
  });
  const approveReceipt = await expectSuccess(publicClient, approveHash, "tUSDC approval");
  const fundingBlock = await publicClient.getBlock();
  const unlockAt = fundingBlock.timestamp;
  const expiresAt = unlockAt + 7n * 24n * 60n * 60n;
  const buyHash = await wallet.writeContract({
    address: router,
    abi: routerAbi,
    functionName: "buyAndGift",
    args: [stock.address, usdcAmount, stockAmount, unlockAt, expiresAt],
  });
  const buyReceipt = await expectSuccess(publicClient, buyHash, "buyAndGift");
  const created = findEvent(buyReceipt, escrow, "GiftCreated");
  const giftId = created.args.giftId;
  assertBigInt(created.args.amount, stockAmount, "funded stock amount");

  console.log("smoke: claim gift", giftId.toString());
  const claimBlock = await publicClient.getBlock();
  const claimDeadline = claimBlock.timestamp + 3600n;
  const digest = await publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "claimAuthorizationDigest",
    args: [giftId, deployer.address, claimDeadline],
  });
  const signature = await authorizer.sign({ hash: digest });
  const claimHash = await wallet.writeContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "claim",
    args: [giftId, deployer.address, claimDeadline, signature],
  });
  const claimReceipt = await expectSuccess(publicClient, claimHash, "claim");
  const claimed = findEvent(claimReceipt, escrow, "GiftClaimed");
  const claimedGift = await waitForGiftStatus(publicClient, escrow, giftId, 2);
  assertBigInt(BigInt(claimedGift.status), 2n, "claimed gift status");

  console.log("smoke: create short-expiry refund gift");
  const stockBalance = await publicClient.readContract({
    address: stock.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [deployer.address],
  });
  const refundAmount = stockAmount > 10n ** 15n ? 10n ** 15n : stockAmount;
  if (stockBalance < refundAmount || refundAmount === 0n) throw new Error("insufficient claimed stock for refund smoke");
  const stockApproveHash = await wallet.writeContract({
    address: stock.address,
    abi: erc20Abi,
    functionName: "approve",
    args: [escrow, refundAmount],
  });
  const stockApproveReceipt = await expectSuccess(publicClient, stockApproveHash, "stock approval");
  const beforeCreate = await publicClient.getBlock();
  const shortExpiry = beforeCreate.timestamp + 30n;
  const createGiftHash = await wallet.writeContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "createGift",
    args: [stock.address, refundAmount, beforeCreate.timestamp, shortExpiry],
  });
  const createReceipt = await expectSuccess(publicClient, createGiftHash, "short gift creation");
  const refundCreated = findEvent(createReceipt, escrow, "GiftCreated");
  const refundGiftId = refundCreated.args.giftId;

  console.log("smoke: waiting for short gift expiry");
  const waitStartedAt = Date.now();
  for (;;) {
    const block = await publicClient.getBlock();
    if (block.timestamp >= shortExpiry) break;
    if (Date.now() - waitStartedAt > 120_000) throw new Error("timed out waiting for refund gift expiry");
    await new Promise((resolveWait) => setTimeout(resolveWait, 3_000));
  }
  const refundHash = await wallet.writeContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "refund",
    args: [refundGiftId],
  });
  const refundReceipt = await expectSuccess(publicClient, refundHash, "refund");
  const refunded = findEvent(refundReceipt, escrow, "GiftRefunded");
  const refundedGift = await waitForGiftStatus(publicClient, escrow, refundGiftId, 3);
  assertBigInt(BigInt(refundedGift.status), 3n, "refunded gift status");
  const locked = await publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "lockedByToken",
    args: [stock.address],
  });

  const manifestHash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex").slice(0, 16);
  const outDir = resolve(root, `evidence/base-sepolia/${manifestHash}`);
  const receiptFields = (receipt) => ({
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber.toString(),
    status: receipt.status,
  });
  atomicWriteJson(resolve(outDir, "contracts.json"), {
    ...audit,
    manifestHash,
    transactions: manifest.transactions,
  });
  atomicWriteJson(resolve(outDir, "gift-claim.json"), {
    giftId: giftId.toString(),
    asset: stock.address,
    amount: stockAmount.toString(),
    recipient: claimed.args.recipient,
    events: { created: stringifyBigInts(created.args), claimed: stringifyBigInts(claimed.args) },
    receipts: {
      approval: receiptFields(approveReceipt),
      funding: receiptFields(buyReceipt),
      claim: receiptFields(claimReceipt),
    },
    finalStatus: Number(claimedGift.status),
  });
  atomicWriteJson(resolve(outDir, "gift-refund.json"), {
    giftId: refundGiftId.toString(),
    asset: stock.address,
    amount: refundAmount.toString(),
    sender: refunded.args.sender,
    events: { created: stringifyBigInts(refundCreated.args), refunded: stringifyBigInts(refunded.args) },
    receipts: {
      approval: receiptFields(stockApproveReceipt),
      funding: receiptFields(createReceipt),
      refund: receiptFields(refundReceipt),
    },
    finalStatus: Number(refundedGift.status),
    escrowLockedAfterSmoke: locked.toString(),
  });
  atomicWriteJson(resolve(outDir, "summary.json"), {
    manifestHash,
    pass: true,
    mode: "contracts",
    generatedAt: new Date().toISOString(),
    faucetTransaction: faucetHash,
  });

  console.log("smoke ok");
  if (faucetHash) console.log("faucetTx", faucetHash);
  console.log("buyTx", buyHash);
  console.log("claimTx", claimHash);
  console.log("refundTx", refundHash);
  console.log("evidence", outDir);
}

async function expectSuccess(client, hash, label) {
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2 });
  if (receipt.status !== "success") throw new Error(`${label} transaction reverted: ${hash}`);
  return receipt;
}

function findEvent(receipt, contract, eventName) {
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(contract)) continue;
    try {
      const decoded = decodeEventLog({ abi: escrowAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === eventName) return decoded;
    } catch {
      // Ignore unrelated logs emitted by the same transaction.
    }
  }
  throw new Error(`${eventName} event not found in ${receipt.transactionHash}`);
}

async function waitForGiftStatus(client, escrow, giftId, expectedStatus) {
  const startedAt = Date.now();
  for (;;) {
    try {
      const gift = await client.readContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "getGift",
        args: [giftId],
      });
      if (Number(gift.status) === expectedStatus) return gift;
    } catch {
      // Public RPC backends can briefly disagree immediately after a receipt.
    }
    if (Date.now() - startedAt > 60_000) {
      throw new Error(`gift ${giftId} did not reach status ${expectedStatus}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  }
}

function assertBigInt(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function stringifyBigInts(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === "bigint" ? item.toString() : item]));
}

function normalizePk(pk) {
  return pk.startsWith("0x") ? pk : `0x${pk}`;
}

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function atomicWriteJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(temporary, path);
}
