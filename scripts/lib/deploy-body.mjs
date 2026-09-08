import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { encodeAbiParameters, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseDeploymentManifest } from "@wisp/shared";
import { auditPhase1 } from "./audit-phase1.mjs";

const ASSET_META = [
  {
    key: "WISPAAPL",
    name: "Wisp Test Apple",
    symbol: "wAAPL",
    usdPriceE6: "316000000",
    saltLabel: "wisp-wAAPL-v1",
  },
  {
    key: "WISPNVDA",
    name: "Wisp Test NVIDIA",
    symbol: "wNVDA",
    usdPriceE6: "225000000",
    saltLabel: "wisp-wNVDA-v1",
  },
  {
    key: "WISPTSLA",
    name: "Wisp Test Tesla",
    symbol: "wTSLA",
    usdPriceE6: "367000000",
    saltLabel: "wisp-wTSLA-v1",
  },
];

export async function runDeploy({
  root,
  client,
  rpcUrl,
  manifestPath,
  forceNew,
  deployerPrivateKey,
  claimAuthorizerPrivateKey,
}) {
  const account = privateKeyToAccount(normalizePk(deployerPrivateKey));
  const claimAccount = privateKeyToAccount(
    normalizePk(claimAuthorizerPrivateKey),
  );

  if (!forceNew && existsSync(manifestPath)) {
    try {
      const existing = parseDeploymentManifest(
        JSON.parse(readFileSync(manifestPath, "utf8")),
      );
      await auditPhase1({ client, manifest: existing, verifyTransactions: true });
      console.log(
        `reusing audited manifest at ${manifestPath} (pass --force-new to redeploy)`,
      );
      if (process.env.ETHERSCAN_API_KEY) {
        verifyCoreContracts({ root, env: process.env, manifest: existing });
      }
      return existing;
    } catch (err) {
      throw new Error(
        `existing deployment failed validation: ${err.message}. Fix it or explicitly pass --force-new`,
      );
    }
  }

  // Pass claim signer address into forge via env.
  const env = {
    ...process.env,
    DEPLOYER_PRIVATE_KEY: normalizePk(deployerPrivateKey),
    CLAIM_SIGNER_ADDRESS: claimAccount.address,
    NEXT_PUBLIC_RPC_URL: rpcUrl,
    B20_SALT_NAMESPACE:
      process.env.B20_SALT_NAMESPACE || (forceNew ? `force-${Date.now()}` : "v1"),
  };

  console.log("broadcasting DeployWisp.s.sol ...");
  const forge = spawnSync(
    "base-forge",
    [
      "script",
      "script/DeployWisp.s.sol:DeployWisp",
      "--rpc-url",
      rpcUrl,
      "--broadcast",
      "--slow",
    ],
    {
      cwd: resolve(root, "contracts"),
      env,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  if (forge.status !== 0) {
    console.error(forge.stdout);
    console.error(forge.stderr);
    throw new Error(`forge script failed with status ${forge.status}`);
  }

  process.stdout.write(forge.stdout);

  const broadcastPath = resolve(
    root,
    "contracts/broadcast/DeployWisp.s.sol/84532/run-latest.json",
  );
  if (!existsSync(broadcastPath)) {
    throw new Error(`broadcast file missing: ${broadcastPath}`);
  }
  const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8"));

  const created = collectCreations(broadcast);
  const mockUsdc = created.find((c) => c.contractName === "MockUSDC")?.address;
  const assetRegistry = created.find(
    (c) => c.contractName === "WispAssetRegistry",
  )?.address;
  const giftEscrow = created.find(
    (c) => c.contractName === "WispGiftEscrow",
  )?.address;
  const demoStockRouter = created.find(
    (c) => c.contractName === "WispDemoStockRouter",
  )?.address;

  if (!mockUsdc || !assetRegistry || !giftEscrow || !demoStockRouter) {
    throw new Error(
      `could not resolve core contract addresses from broadcast (found: ${created
        .map((c) => c.contractName)
        .join(", ")})`,
    );
  }

  // Asset addresses: parse console logs `WISPAAPL 0x...`
  const assets = [];
  for (const meta of ASSET_META) {
    const match = forge.stdout.match(
      new RegExp(`${meta.key}\\s+(0x[a-fA-F0-9]{40})`),
    );
    if (!match) {
      console.log(`asset ${meta.key} omitted (probe failed or not logged)`);
      continue;
    }
    const address = getAddress(match[1]);
    const code = await client.getBytecode({ address });
    if (!code || code === "0x") {
      console.log(`asset ${meta.key} omitted (empty code at ${address})`);
      continue;
    }
    assets.push({
      key: meta.key,
      name: meta.name,
      symbol: meta.symbol,
      address,
      decimals: 18,
      usdPriceE6: meta.usdPriceE6,
      priceAsOf: "2026-09-08",
      testOnly: true,
    });
  }

  if (assets.length !== ASSET_META.length) {
    throw new Error(`expected ${ASSET_META.length} usable B20 assets, found ${assets.length}`);
  }

  const deployTxs = (broadcast.transactions || [])
    .map((t) => t.hash)
    .filter(Boolean);
  if (deployTxs.length === 0) throw new Error("broadcast contains no deployment transactions");
  const seedInventory = deployTxs[deployTxs.length - 1];
  const deploymentReceipts = await Promise.all(
    deployTxs.map((hash) => client.getTransactionReceipt({ hash })),
  );
  if (deploymentReceipts.some((receipt) => receipt.status !== "success")) {
    throw new Error("at least one deployment transaction reverted");
  }
  const deploymentBlock = Number(
    deploymentReceipts.reduce(
      (lowest, receipt) => receipt.blockNumber < lowest ? receipt.blockNumber : lowest,
      deploymentReceipts[0].blockNumber,
    ),
  );

  const manifest = {
    version: 1,
    network: "base-sepolia",
    chainId: 84532,
    deploymentBlock,
    deployer: account.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      mockUsdc: getAddress(mockUsdc),
      assetRegistry: getAddress(assetRegistry),
      giftEscrow: getAddress(giftEscrow),
      demoStockRouter: getAddress(demoStockRouter),
    },
    claimSigner: claimAccount.address,
    treasury: account.address,
    faucet: {
      maxAmount: "1000000000",
      cooldownSeconds: 3600,
    },
    assets,
    transactions: {
      deploy: deployTxs,
      seedInventory,
    },
  };

  const parsed = parseDeploymentManifest(manifest);
  await auditPhase1({ client, manifest: parsed, verifyTransactions: false });
  atomicWriteJson(manifestPath, parsed);

  if (process.env.ETHERSCAN_API_KEY) {
    console.log("attempting explorer verification...");
    verifyCoreContracts({ root, env, manifest: parsed });
  } else {
    console.log("ETHERSCAN_API_KEY unset; skipping verification");
  }

  console.log(`wrote ${manifestPath}`);
  return parsed;
}

function verifyCoreContracts({ root, env, manifest }) {
  const contracts = [
    [manifest.contracts.mockUsdc, "src/mocks/MockUSDC.sol:MockUSDC", undefined],
    [
      manifest.contracts.assetRegistry,
      "src/WispAssetRegistry.sol:WispAssetRegistry",
      encodeAbiParameters([{ type: "address" }], [manifest.deployer]),
    ],
    [
      manifest.contracts.giftEscrow,
      "src/WispGiftEscrow.sol:WispGiftEscrow",
      encodeAbiParameters(
        [{ type: "address" }, { type: "address" }, { type: "address" }],
        [manifest.deployer, manifest.contracts.assetRegistry, manifest.claimSigner],
      ),
    ],
    [
      manifest.contracts.demoStockRouter,
      "src/WispDemoStockRouter.sol:WispDemoStockRouter",
      encodeAbiParameters(
        [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }],
        [
          manifest.contracts.mockUsdc,
          manifest.contracts.assetRegistry,
          manifest.contracts.giftEscrow,
          manifest.treasury,
        ],
      ),
    ],
  ];

  for (const [address, contract, constructorArgs] of contracts) {
    const verify = spawnSync(
      "base-forge",
      [
        "verify-contract",
        "--chain-id",
        "84532",
        "--etherscan-api-key",
        env.ETHERSCAN_API_KEY,
        ...(constructorArgs ? ["--constructor-args", constructorArgs] : []),
        address,
        contract,
      ],
      { cwd: resolve(root, "contracts"), env, encoding: "utf8" },
    );
    if (verify.status !== 0) {
      console.log(`explorer verification unavailable or failed for ${contract}`);
    }
  }
}

function collectCreations(broadcast) {
  const out = [];
  for (const tx of broadcast.transactions || []) {
    if (tx.contractName && tx.contractAddress) {
      out.push({
        contractName: tx.contractName,
        address: getAddress(tx.contractAddress),
      });
    }
  }
  for (const r of broadcast.receipts || []) {
    for (const log of r.logs || []) {
      // no-op; creations come from transactions list
    }
  }
  return out;
}

function normalizePk(pk) {
  const raw = pk.startsWith("0x") ? pk : `0x${pk}`;
  return raw;
}

function atomicWriteJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}
