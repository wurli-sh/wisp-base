"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  hashTypedData,
  sliceHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { getUserOperation } from "@coinbase/cdp-core";
import { CDPReactProvider } from "@coinbase/cdp-react";
import {
  useAuthenticateWithJWT,
  useCreateEvmEoaAccount,
  useCreateEvmSmartAccount,
  useEvmAddress,
  useEvmSmartAccounts,
  useIsInitialized,
  useIsSignedIn,
  useSendEvmTransaction,
  useSendUserOperation,
  useSignEvmTypedData,
} from "@coinbase/cdp-hooks";
import { getAccessToken } from "@/lib/auth";
import {
  contractAddresses,
  loadDeployment,
  mockUsdcAbi,
  publicClient,
} from "@/lib/chain";
import type { CdpWalletOperations, WalletTypedData } from "./WalletProvider";

/** Coinbase Smart Wallet ERC-1271 expects a SignatureWrapper over replaySafeHash(digest). */
async function signCoinbaseSmartAccountTypedData(params: {
  smartAccount: Address;
  ownerEoa: Address;
  ownerIndex: number;
  typedData: WalletTypedData;
  signEvmTypedData: (opts: {
    evmAccount: Address;
    typedData: never;
    idempotencyKey: string;
  }) => Promise<{ signature: Hex }>;
}): Promise<Hex> {
  const digest = hashTypedData(params.typedData as never);
  const replaySafe = {
    domain: {
      name: "Coinbase Smart Wallet",
      version: "1",
      chainId: 84532,
      verifyingContract: params.smartAccount,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      CoinbaseSmartWalletMessage: [{ name: "hash", type: "bytes32" }],
    },
    primaryType: "CoinbaseSmartWalletMessage" as const,
    message: { hash: digest },
  };
  const { signature } = await params.signEvmTypedData({
    evmAccount: params.ownerEoa,
    typedData: replaySafe as never,
    idempotencyKey: crypto.randomUUID(),
  });
  const r = sliceHex(signature, 0, 32);
  const s = sliceHex(signature, 32, 64);
  const v = Number.parseInt(signature.slice(130, 132), 16);
  const signatureData = encodePacked(["bytes32", "bytes32", "uint8"], [r, s, v]);
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "ownerIndex", type: "uint8" },
          { name: "signatureData", type: "bytes" },
        ],
      },
    ],
    [{ ownerIndex: params.ownerIndex, signatureData }],
  );
}

type CdpUserLike = {
  evmSmartAccounts?: readonly string[] | null;
  evmSmartAccountObjects?: ReadonlyArray<{
    address?: string | null;
    ownerAddresses?: readonly string[] | null;
  }> | null;
  evmAccounts?: readonly string[] | null;
  evmAccountObjects?: ReadonlyArray<{ address?: string | null }> | null;
};

function smartAddressFromUser(user: CdpUserLike): Address | null {
  const fromAccounts = user.evmSmartAccounts?.[0];
  if (fromAccounts) return fromAccounts as Address;
  const fromObjects = user.evmSmartAccountObjects?.[0]?.address;
  if (fromObjects) return fromObjects as Address;
  return null;
}

function eoaAddressFromUser(user: CdpUserLike): Address | null {
  const fromAccounts = user.evmAccounts?.[0];
  if (fromAccounts) return fromAccounts as Address;
  const fromObjects = user.evmAccountObjects?.[0]?.address;
  if (fromObjects) return fromObjects as Address;
  const owner = user.evmSmartAccountObjects?.[0]?.ownerAddresses?.[0];
  if (owner) return owner as Address;
  return null;
}

function currentAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

function mapCdpAuthError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const extras =
    typeof error === "object" && error
      ? [
          "errorMessage" in error
            ? String((error as { errorMessage?: unknown }).errorMessage ?? "")
            : "",
          "errorType" in error
            ? String((error as { errorType?: unknown }).errorType ?? "")
            : "",
        ].join(" ")
      : "";
  const blob = `${message} ${extras}`;
  const origin = currentAppOrigin();
  if (/project config not found/i.test(blob)) {
    return new Error("cdp_project_config_missing");
  }
  if (
    origin &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) &&
    /(forbidden|unauthorized|blocked|invalid|disallowed).{0,40}origin|origin.{0,40}(not |dis)?allow|cors|access-control|domain.{0,20}(not |dis)?allow|not allowlisted.{0,40}(origin|domain)/i.test(
      blob,
    )
  ) {
    return new Error(`cdp_origin_blocked:${origin}`);
  }
  if (/method not allowed|errorType.:.not_found|\bnot_found\b/i.test(blob)) {
    return new Error("cdp_method_not_allowed");
  }
  if (/network error|failed to fetch|cors|access-control/i.test(blob)) {
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return new Error(`cdp_origin_blocked:${origin}`);
    }
    return new Error("cdp_network_unavailable");
  }
  if (
    /jwks|issuer|audience|custom.?auth|unauthorized|invalid.?jwt|missing kid|jwt/i.test(
      blob,
    )
  ) {
    return new Error("cdp_auth_failed");
  }
  return error instanceof Error ? error : new Error(message || "cdp_auth_failed");
}

async function waitForUserOperationTxHash(
  smartAccount: Address,
  userOperationHash: Hex,
): Promise<Hash> {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    const op = await getUserOperation({
      userOperationHash,
      evmSmartAccount: smartAccount,
      network: "base-sepolia",
    });
    if (op.status === "failed" || op.status === "dropped") {
      throw new Error("transaction_reverted");
    }
    if (op.transactionHash) {
      return op.transactionHash as Hash;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  throw new Error("transaction_timeout");
}

function OperationsSync({
  onAddress,
  onOperations,
  onEnsureWallet,
}: {
  onAddress: (address: Address | null) => void;
  onOperations: (operations: CdpWalletOperations | null) => void;
  onEnsureWallet: (ensure: (() => Promise<Address>) | null) => void;
}) {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { authenticateWithJWT } = useAuthenticateWithJWT();
  const { createEvmEoaAccount } = useCreateEvmEoaAccount();
  const { createEvmSmartAccount } = useCreateEvmSmartAccount();
  const { evmAddress } = useEvmAddress();
  const { evmSmartAccounts } = useEvmSmartAccounts();
  const { sendUserOperation } = useSendUserOperation();
  const { sendEvmTransaction } = useSendEvmTransaction();
  const { signEvmTypedData } = useSignEvmTypedData();
  const authInFlight = useRef<Promise<Address> | null>(null);
  const isInitializedRef = useRef(isInitialized);
  const isSignedInRef = useRef(isSignedIn);
  const evmAddressRef = useRef(evmAddress);
  const smartRef = useRef(evmSmartAccounts);
  isInitializedRef.current = isInitialized;
  isSignedInRef.current = isSignedIn;
  evmAddressRef.current = evmAddress;
  smartRef.current = evmSmartAccounts;

  const smartAddress = (evmSmartAccounts?.[0]?.address as Address | undefined) ?? null;
  const ownerAddresses = evmSmartAccounts?.[0]?.ownerAddresses ?? [];
  const ownerEoa = (ownerAddresses[0] as Address | undefined) ?? null;
  const ownerIndex = Math.max(
    0,
    ownerEoa
      ? ownerAddresses.findIndex((a) => a.toLowerCase() === ownerEoa.toLowerCase())
      : 0,
  );
  const displayAddress =
    smartAddress ?? ((evmAddress as Address | null | undefined) ?? null);

  useEffect(() => onAddress(displayAddress), [displayAddress, onAddress]);

  useEffect(() => {
    if (!displayAddress) {
      onOperations(null);
      return;
    }

    const signerAccount = ownerEoa ?? displayAddress;
    const sponsoredSmart = smartAddress;

    onOperations({
      signTypedData: async (typedData: WalletTypedData) => {
        if (sponsoredSmart && ownerEoa) {
          return signCoinbaseSmartAccountTypedData({
            smartAccount: sponsoredSmart,
            ownerEoa,
            ownerIndex,
            typedData,
            signEvmTypedData: signEvmTypedData as never,
          });
        }
        const result = await signEvmTypedData({
          evmAccount: signerAccount,
          typedData: typedData as never,
          idempotencyKey: crypto.randomUUID(),
        });
        return result.signature as `0x${string}`;
      },
      ensureDeployed: async () => {
        if (!sponsoredSmart) return;
        const code = await publicClient.getCode({ address: sponsoredSmart });
        if (code && code !== "0x") return;

        // Counterfactual smart accounts only exist after the first user op.
        // ERC-1271 wallet bind requires onchain code, so deploy with a sponsored
        // no-op call against an allowlisted contract (mockUsdc.faucetMax).
        const manifest = await loadDeployment();
        const { mockUsdc } = contractAddresses(manifest);
        const { userOperationHash } = await sendUserOperation({
          evmSmartAccount: sponsoredSmart,
          network: "base-sepolia",
          calls: [
            {
              to: mockUsdc,
              data: encodeFunctionData({
                abi: mockUsdcAbi,
                functionName: "faucetMax",
              }),
              value: 0n,
            },
          ],
          useCdpPaymaster: true,
          idempotencyKey: crypto.randomUUID(),
        });
        await waitForUserOperationTxHash(sponsoredSmart, userOperationHash as Hex);
      },
      sendTransaction: async (tx) => {
        if (sponsoredSmart) {
          const { userOperationHash } = await sendUserOperation({
            evmSmartAccount: sponsoredSmart,
            network: "base-sepolia",
            calls: [
              {
                to: tx.to,
                data: tx.data ?? "0x",
                value: tx.value ?? 0n,
              },
            ],
            useCdpPaymaster: true,
            idempotencyKey: crypto.randomUUID(),
          });
          return waitForUserOperationTxHash(
            sponsoredSmart,
            userOperationHash as Hex,
          );
        }

        const result = await sendEvmTransaction({
          evmAccount: displayAddress,
          network: "base-sepolia",
          transaction: {
            type: "eip1559",
            chainId: 84532,
            to: tx.to,
            data: tx.data,
            value: tx.value ?? 0n,
          },
          idempotencyKey: crypto.randomUUID(),
        });
        return result.transactionHash as `0x${string}`;
      },
    });
    return () => onOperations(null);
  }, [
    displayAddress,
    onOperations,
    ownerEoa,
    ownerIndex,
    sendEvmTransaction,
    sendUserOperation,
    signEvmTypedData,
    smartAddress,
  ]);

  const ensureWallet = useCallback(async () => {
    const existingSmart = smartRef.current?.[0]?.address as Address | undefined;
    if (existingSmart) return existingSmart;
    if (authInFlight.current) return authInFlight.current;

    const run = (async () => {
      const started = Date.now();
      while (!isInitializedRef.current) {
        if (Date.now() - started > 15_000) throw new Error("cdp_not_ready");
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }

      if (smartRef.current?.[0]?.address) {
        return smartRef.current[0].address as Address;
      }

      const token = await getAccessToken();
      if (!token) throw new Error("unauthorized");

      let smart: Address | null =
        (smartRef.current?.[0]?.address as Address | undefined) ?? null;
      let eoa: Address | null = null;

      if (!isSignedInRef.current || !smart) {
        try {
          const { user } = await authenticateWithJWT();
          smart = smartAddressFromUser(user) ?? smart;
          eoa = eoaAddressFromUser(user);
        } catch (error) {
          throw mapCdpAuthError(error);
        }
      }

      if (!eoa && !smart) {
        try {
          eoa = (await createEvmEoaAccount()) as Address;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/already|exist/i.test(message)) {
            throw error instanceof Error ? error : new Error(message || "wallet_unavailable");
          }
        }
      }

      if (!smart) {
        try {
          smart = (await createEvmSmartAccount(
            eoa ? { owner: eoa } : undefined,
          )) as Address;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/already|exist/i.test(message)) {
            throw error instanceof Error ? error : new Error(message || "wallet_unavailable");
          }
        }
      }

      if (!smart) {
        const waitStarted = Date.now();
        while (Date.now() - waitStarted < 8_000) {
          await new Promise((resolve) => window.setTimeout(resolve, 100));
          if (smartRef.current?.[0]?.address) {
            smart = smartRef.current[0].address as Address;
            break;
          }
          if (evmAddressRef.current) {
            // useEvmAddress prefers smart once provisioned
            smart = evmAddressRef.current as Address;
            break;
          }
        }
      }

      if (!smart) throw new Error("wallet_unavailable");
      onAddress(smart);
      return smart;
    })();

    authInFlight.current = run;
    try {
      return await run;
    } finally {
      authInFlight.current = null;
    }
  }, [authenticateWithJWT, createEvmEoaAccount, createEvmSmartAccount, onAddress]);

  useEffect(() => {
    onEnsureWallet(ensureWallet);
    return () => onEnsureWallet(null);
  }, [ensureWallet, onEnsureWallet]);

  // Eagerly provision once CDP + Supabase session are available.
  useEffect(() => {
    if (!isInitialized || displayAddress) return;
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      try {
        await ensureWallet();
      } catch {
        // Leave explicit “Create / link wallet” as the user-facing retry path.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [displayAddress, ensureWallet, isInitialized]);

  return null;
}

export function CdpBridge({
  projectId,
  onAddress,
  onOperations,
  onEnsureWallet,
}: CdpBridgeProps) {
  return (
    <CDPReactProvider
      config={{
        projectId,
        customAuth: {
          getJwt: async () => (await getAccessToken()) ?? undefined,
        },
        // Smart accounts are required for CDP Paymaster gas sponsorship.
        ethereum: { createOnLogin: "smart" },
        appName: "Wisp",
      }}
    >
      <OperationsSync
        onAddress={onAddress}
        onOperations={onOperations}
        onEnsureWallet={onEnsureWallet}
      />
    </CDPReactProvider>
  );
}

export type CdpBridgeProps = {
  projectId: string;
  onAddress: (address: Address | null) => void;
  onOperations: (operations: CdpWalletOperations | null) => void;
  onEnsureWallet: (ensure: (() => Promise<Address>) | null) => void;
  children?: ReactNode;
};
