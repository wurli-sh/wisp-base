"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { apiFetch } from "@/lib/api/client";
import { getAccessToken } from "@/lib/auth";
import {
  CHAIN_ID,
  contractAddresses,
  loadDeployment,
  mockUsdcAbi,
  publicClient,
  registryAbi,
  routerAbi,
} from "@/lib/chain";
import { parseRecipient } from "@/lib/recipient";
import {
  stockByKey,
  usdDollarsToUsdcRaw,
  type StockKey,
} from "@/lib/stocks";
import { useWispWallet } from "@/lib/wallet";
import { ensureBoundWallet } from "@/lib/wallet/link";
import {
  clearSendResume,
  persistSendResume,
  readSendResume,
  sendReducer,
  initialSendState,
  type SendState,
} from "./sendReducer";

export type SendFormInput = {
  stockKey: StockKey;
  usdAmount: string;
  recipient: string;
  unlockAt: Date;
  expiresAt: Date;
  message: string;
  anonymousSender: boolean;
};

export function useSendController() {
  const wallet = useWispWallet();
  const [state, dispatch] = useReducer(sendReducer, initialSendState);
  const abortRef = useRef(false);
  const sendingRef = useRef(false);

  useEffect(() => {
    const resume = readSendResume();
    if (!resume) return;
    dispatch({ type: "prepared", apiGiftId: resume.apiGiftId, usePermit: true });
    dispatch({ type: "submitted", txHash: resume.txHash });
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        // The first submission call may have been interrupted after the chain
        // accepted the transaction. Re-attach the persisted hash before polling.
        await apiFetch(`/v1/gifts/${resume.apiGiftId}/submitted`, {
          token,
          body: { txHash: resume.txHash },
        });
      } catch {
        // The projection may already be beyond submitted; polling is authoritative.
      }
      const ok = await pollUntilDelivered(resume.apiGiftId, (stage) =>
        dispatch({ type: "stage", stage }),
      );
      if (ok) {
        clearSendResume();
        dispatch({ type: "complete" });
      }
    })();
  }, []);

  const send = useCallback(
    async (input: SendFormInput) => {
      if (sendingRef.current) throw new Error("operation_in_progress");
      sendingRef.current = true;
      abortRef.current = false;
      try {
        const parsed = parseRecipient(input.recipient);
        if (!parsed.ok) throw new Error("invalid_recipient");
        const usdcRaw = usdDollarsToUsdcRaw(input.usdAmount);
        if (!usdcRaw || usdcRaw <= 0n) throw new Error("invalid_amount");

        dispatch({ type: "stage", stage: "signing_in" });
        const token = await getAccessToken();
        if (!token) throw new Error("unauthorized");

        dispatch({ type: "stage", stage: "setting_up_wallet" });
        const address = await ensureBoundWallet(wallet);

        const manifest = await loadDeployment();
        const addrs = contractAddresses(manifest);
        const stockMeta = stockByKey(input.stockKey);
        const asset = manifest.assets.find((a) => a.key === input.stockKey);
        if (!stockMeta || !asset) throw new Error("unknown_stock");

        const stock = asset.address as Address;
        const [enabled, quoted] = await Promise.all([
          publicClient.readContract({
            address: addrs.assetRegistry,
            abi: registryAbi,
            functionName: "isEnabled",
            args: [stock],
          }),
          publicClient.readContract({
            address: addrs.assetRegistry,
            abi: registryAbi,
            functionName: "quoteStockAmount",
            args: [stock, usdcRaw],
          }),
        ]);
        if (!enabled) throw new Error("asset_disabled");
        if (quoted <= 0n) throw new Error("insufficient_router_inventory");

        const balance = await publicClient.readContract({
          address: addrs.mockUsdc,
          abi: mockUsdcAbi,
          functionName: "balanceOf",
          args: [address],
        });
        if (balance < usdcRaw) throw new Error("insufficient_test_usdc");

        dispatch({ type: "stage", stage: "resolving_recipient" });
        const resolved = await apiFetch<{
          descriptor: Record<string, unknown>;
          signature: string;
        }>("/v1/resolve", {
          token,
          body: { kind: parsed.kind, identifier: parsed.identifier },
        });

        dispatch({ type: "stage", stage: "preparing_gift" });
        const created = await apiFetch<{
          gift: { id: string };
          minStockAmount: string;
        }>(
          "/v1/gifts",
          {
            token,
            headers: { "idempotency-key": crypto.randomUUID() },
            body: {
              descriptor: resolved.descriptor,
              signature: resolved.signature,
              tokenAddress: stock,
              usdcAmount: usdcRaw.toString(),
              quotedStockAmount: quoted.toString(),
              unlockAt: input.unlockAt.toISOString(),
              expiresAt: input.expiresAt.toISOString(),
              anonymousSender: input.anonymousSender,
              message: input.message.trim() || null,
            },
          },
        );

        const allowance = await publicClient.readContract({
          address: addrs.mockUsdc,
          abi: mockUsdcAbi,
          functionName: "allowance",
          args: [address, addrs.demoStockRouter],
        });

        const unlockAt = BigInt(Math.floor(input.unlockAt.getTime() / 1000));
        const expiresAt = BigInt(Math.floor(input.expiresAt.getTime() / 1000));
        const minStock = BigInt(created.minStockAmount);

        let usePermit = true;
        let giftData: Hex;

        try {
          // Prepare and simulate the permit route before broadcasting anything.
          // Once a transaction is submitted we never enter the approval fallback,
          // because a transport timeout can leave the original tx pending onchain.
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
          const nonce = await publicClient.readContract({
            address: addrs.mockUsdc,
            abi: mockUsdcAbi,
            functionName: "nonces",
            args: [address],
          });
          const name = await publicClient.readContract({
            address: addrs.mockUsdc,
            abi: mockUsdcAbi,
            functionName: "name",
          });
          const signature = await wallet.signTypedData({
            domain: {
              name,
              version: "1",
              chainId: CHAIN_ID,
              verifyingContract: addrs.mockUsdc,
            },
            types: {
              Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
              ],
            },
            primaryType: "Permit",
            message: {
              owner: address,
              spender: addrs.demoStockRouter,
              value: usdcRaw.toString(),
              nonce: nonce.toString(),
              deadline: deadline.toString(),
            },
          });
          const { r, s, v } = splitSig(signature);
          dispatch({ type: "prepared", apiGiftId: created.gift.id, usePermit: true });
          giftData = encodeFunctionData({
            abi: routerAbi,
            functionName: "buyAndGiftWithPermit",
            args: [stock, usdcRaw, minStock, unlockAt, expiresAt, deadline, v, r, s],
          });
          await publicClient.simulateContract({
            address: addrs.demoStockRouter,
            abi: routerAbi,
            functionName: "buyAndGiftWithPermit",
            args: [stock, usdcRaw, minStock, unlockAt, expiresAt, deadline, v, r, s],
            account: address,
          });
        } catch (permitError) {
          if (isUserRejected(permitError)) throw permitError;
          usePermit = false;
          dispatch({ type: "prepared", apiGiftId: created.gift.id, usePermit: false });
          if (allowance < usdcRaw) {
            dispatch({ type: "stage", stage: "approving_test_usdc" });
            const approveData = encodeFunctionData({
              abi: mockUsdcAbi,
              functionName: "approve",
              args: [addrs.demoStockRouter, usdcRaw],
            });
            await publicClient.simulateContract({
              address: addrs.mockUsdc,
              abi: mockUsdcAbi,
              functionName: "approve",
              args: [addrs.demoStockRouter, usdcRaw],
              account: address,
            });
            const approveHash = await wallet.sendTransaction({ to: addrs.mockUsdc, data: approveData });
            await wallet.waitForReceipt(approveHash);
          }
          dispatch({ type: "stage", stage: "sending_gift" });
          giftData = encodeFunctionData({
            abi: routerAbi,
            functionName: "buyAndGift",
            args: [stock, usdcRaw, minStock, unlockAt, expiresAt],
          });
          await publicClient.simulateContract({
            address: addrs.demoStockRouter,
            abi: routerAbi,
            functionName: "buyAndGift",
            args: [stock, usdcRaw, minStock, unlockAt, expiresAt],
            account: address,
          });
        }

        dispatch({ type: "stage", stage: "sending_gift" });
        const txHash = await wallet.sendTransaction({ to: addrs.demoStockRouter, data: giftData });

        dispatch({ type: "submitted", txHash });
        persistSendResume({
          apiGiftId: created.gift.id,
          txHash,
          stage: "confirming_on_base",
        });

        await apiFetch(`/v1/gifts/${created.gift.id}/submitted`, {
          token,
          body: { txHash },
        });

        await wallet.waitForReceipt(txHash);
        dispatch({ type: "stage", stage: "delivering_to_inbox" });
        const ok = await pollUntilDelivered(created.gift.id, (stage) =>
          dispatch({ type: "stage", stage }),
        );
        if (!ok) throw new Error("delivery_timeout");
        clearSendResume();
        dispatch({ type: "complete" });
        return { apiGiftId: created.gift.id, txHash, usePermit };
      } catch (e) {
        const message = e instanceof Error ? e.message : "send_failed";
        dispatch({ type: "error", error: message });
        throw e;
      } finally {
        sendingRef.current = false;
      }
    },
    [wallet],
  );

  return { state: state as SendState, dispatch, send, wallet };
}

async function pollUntilDelivered(
  giftId: string,
  onStage: (stage: SendState["stage"]) => void,
): Promise<boolean> {
  onStage("delivering_to_inbox");
  for (let i = 0; i < 40; i++) {
    const token = await getAccessToken();
    if (!token) return false;
    try {
      const projection = await apiFetch<{ gift?: { state?: string } }>(`/v1/gifts/${giftId}`, { token });
      const state = projection.gift?.state;
      if (state === "funded" || state === "delivered" || state === "claimable") {
        return true;
      }
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function isUserRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /user rejected|user denied|rejected request|4001/i.test(message);
}

function splitSig(signature: Hex): { v: number; r: Hex; s: Hex } {
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  let v = parseInt(signature.slice(130, 132), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}
