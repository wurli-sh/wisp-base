import { getAddress, keccak256, parseAbi, stringToHex } from "viem";

const escrowAbi = parseAbi([
  "function owner() view returns (address)",
  "function registry() view returns (address)",
  "function claimSigner() view returns (address)",
  "function demoRouter() view returns (address)",
  "function lockedByToken(address) view returns (uint256)",
]);

const routerAbi = parseAbi([
  "function mockUsdc() view returns (address)",
  "function registry() view returns (address)",
  "function escrow() view returns (address)",
  "function treasury() view returns (address)",
]);

const registryAbi = parseAbi([
  "function owner() view returns (address)",
  "function getAsset(address) view returns ((bool enabled,uint8 decimals,uint64 usdPriceE6,bytes32 assetKey))",
]);

const tokenAbi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);

const faucetAbi = parseAbi([
  "function FAUCET_MAX() view returns (uint256)",
  "function FAUCET_COOLDOWN() view returns (uint64)",
]);

export async function auditPhase1({ client, manifest, verifyTransactions = true }) {
  const chainId = await client.getChainId();
  assertEqual(chainId, manifest.chainId, "RPC chain ID");

  const namedAddresses = {
    ...manifest.contracts,
    ...Object.fromEntries(manifest.assets.map((asset) => [asset.key, asset.address])),
  };
  const codeHashes = {};
  for (const [name, address] of Object.entries(namedAddresses)) {
    const code = await client.getBytecode({ address });
    if (!code || code === "0x") throw new Error(`${name} has no code at ${address}`);
    codeHashes[name] = keccak256(code);
  }

  const escrow = manifest.contracts.giftEscrow;
  const registry = manifest.contracts.assetRegistry;
  const router = manifest.contracts.demoStockRouter;
  const usdc = manifest.contracts.mockUsdc;

  const [escrowOwner, escrowRegistry, claimSigner, demoRouter] = await Promise.all([
    read(client, escrow, escrowAbi, "owner"),
    read(client, escrow, escrowAbi, "registry"),
    read(client, escrow, escrowAbi, "claimSigner"),
    read(client, escrow, escrowAbi, "demoRouter"),
  ]);
  assertAddress(escrowOwner, manifest.deployer, "escrow owner");
  assertAddress(escrowRegistry, registry, "escrow registry");
  assertAddress(claimSigner, manifest.claimSigner, "claim signer");
  assertAddress(demoRouter, router, "escrow demo router");

  const [routerUsdc, routerRegistry, routerEscrow, treasury, registryOwner] = await Promise.all([
    read(client, router, routerAbi, "mockUsdc"),
    read(client, router, routerAbi, "registry"),
    read(client, router, routerAbi, "escrow"),
    read(client, router, routerAbi, "treasury"),
    read(client, registry, registryAbi, "owner"),
  ]);
  assertAddress(routerUsdc, usdc, "router tUSDC");
  assertAddress(routerRegistry, registry, "router registry");
  assertAddress(routerEscrow, escrow, "router escrow");
  assertAddress(treasury, manifest.treasury, "router treasury");
  assertAddress(registryOwner, manifest.deployer, "registry owner");

  const [usdcName, usdcSymbol, usdcDecimals, faucetMax, faucetCooldown] = await Promise.all([
    read(client, usdc, tokenAbi, "name"),
    read(client, usdc, tokenAbi, "symbol"),
    read(client, usdc, tokenAbi, "decimals"),
    read(client, usdc, faucetAbi, "FAUCET_MAX"),
    read(client, usdc, faucetAbi, "FAUCET_COOLDOWN"),
  ]);
  assertEqual(usdcName, "Wisp Test USDC", "tUSDC name");
  assertEqual(usdcSymbol, "tUSDC", "tUSDC symbol");
  assertEqual(Number(usdcDecimals), 6, "tUSDC decimals");
  assertEqual(faucetMax.toString(), manifest.faucet.maxAmount, "faucet max");
  assertEqual(Number(faucetCooldown), manifest.faucet.cooldownSeconds, "faucet cooldown");

  const assets = [];
  for (const asset of manifest.assets) {
    const [name, symbol, decimals, inventory, escrowBalance, locked, config] = await Promise.all([
      read(client, asset.address, tokenAbi, "name"),
      read(client, asset.address, tokenAbi, "symbol"),
      read(client, asset.address, tokenAbi, "decimals"),
      read(client, asset.address, tokenAbi, "balanceOf", [router]),
      read(client, asset.address, tokenAbi, "balanceOf", [escrow]),
      read(client, escrow, escrowAbi, "lockedByToken", [asset.address]),
      read(client, registry, registryAbi, "getAsset", [asset.address]),
    ]);
    assertEqual(name, asset.name, `${asset.key} name`);
    assertEqual(symbol, asset.symbol, `${asset.key} symbol`);
    assertEqual(Number(decimals), asset.decimals, `${asset.key} decimals`);
    if (inventory <= 0n) throw new Error(`${asset.key} router inventory is empty`);
    if (!config.enabled) throw new Error(`${asset.key} is disabled in registry`);
    assertEqual(Number(config.decimals), asset.decimals, `${asset.key} registry decimals`);
    assertEqual(config.usdPriceE6.toString(), asset.usdPriceE6, `${asset.key} price`);
    assertEqual(config.assetKey, keccak256(stringToHex(asset.key)), `${asset.key} registry key`);
    if (escrowBalance < locked) throw new Error(`${asset.key} escrow is undercollateralized`);
    assets.push({
      key: asset.key,
      address: asset.address,
      codeHash: codeHashes[asset.key],
      routerInventory: inventory.toString(),
      escrowBalance: escrowBalance.toString(),
      locked: locked.toString(),
    });
  }

  let confirmedTransactions = 0;
  let deploymentBlock = manifest.deploymentBlock;
  if (verifyTransactions) {
    const receipts = await inBatches(manifest.transactions.deploy, 6, (hash) =>
      client.getTransactionReceipt({ hash }),
    );
    for (const receipt of receipts) {
      if (receipt.status !== "success") throw new Error(`deployment transaction reverted: ${receipt.transactionHash}`);
    }
    deploymentBlock = Number(receipts.reduce(
      (lowest, receipt) => receipt.blockNumber < lowest ? receipt.blockNumber : lowest,
      receipts[0].blockNumber,
    ));
    assertEqual(deploymentBlock, manifest.deploymentBlock, "deployment block");
    if (!manifest.transactions.deploy.some(
      (hash) => hash.toLowerCase() === manifest.transactions.seedInventory.toLowerCase(),
    )) throw new Error("seedInventory transaction is absent from transactions.deploy");
    confirmedTransactions = receipts.length;
  }

  return {
    pass: true,
    network: manifest.network,
    chainId,
    deploymentBlock,
    confirmedTransactions,
    contracts: Object.fromEntries(
      Object.entries(manifest.contracts).map(([name, address]) => [name, { address, codeHash: codeHashes[name] }]),
    ),
    assets,
  };
}

async function read(client, address, abi, functionName, args = undefined) {
  return client.readContract({ address, abi, functionName, ...(args ? { args } : {}) });
}

async function inBatches(items, size, fn) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(...await Promise.all(items.slice(index, index + size).map(fn)));
  }
  return output;
}

function assertAddress(actual, expected, label) {
  if (getAddress(actual) !== getAddress(expected)) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
