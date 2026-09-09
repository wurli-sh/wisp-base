"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Address, Hash, Hex, TransactionReceipt } from "viem";
import { CHAIN_ID, publicClient, type TxRequest } from "@/lib/chain";

export type WalletStatus = "idle" | "unavailable" | "ready" | "busy";
export type WalletTypedData = {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
};
export type CdpWalletOperations = {
  signTypedData: (params: WalletTypedData) => Promise<Hex>;
  sendTransaction: (tx: TxRequest) => Promise<Hash>;
  /** Deploy counterfactual smart account via a sponsored no-op user op (no-op if already deployed / EOA). */
  ensureDeployed: () => Promise<void>;
};

const EIP712_DOMAIN_FIELD_TYPES: Record<string, string> = {
  name: "string",
  version: "string",
  chainId: "uint256",
  verifyingContract: "address",
  salt: "bytes32",
};

/** CDP (and some wallets) require an explicit EIP712Domain in `types`. */
export function withEip712Domain(params: WalletTypedData): WalletTypedData {
  if (params.types.EIP712Domain?.length) return params;
  const fields = Object.keys(params.domain)
    .filter((key) => params.domain[key] !== undefined && key in EIP712_DOMAIN_FIELD_TYPES)
    .map((name) => ({ name, type: EIP712_DOMAIN_FIELD_TYPES[name]! }));
  return {
    ...params,
    types: {
      EIP712Domain: fields,
      ...params.types,
    },
  };
}
export type WispWallet = {
  status: WalletStatus;
  address: Address | null;
  chainId: number | null;
  ensureWallet: () => Promise<Address>;
  ensureDeployed: () => Promise<void>;
  signTypedData: (params: WalletTypedData) => Promise<Hex>;
  sendTransaction: (tx: TxRequest) => Promise<Hash>;
  waitForReceipt: (hash: Hash) => Promise<TransactionReceipt>;
  setExternalWallet: (address: Address | null) => void;
};

const WalletCtx = createContext<WispWallet | null>(null);
type EthProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

function getEthereum(): EthProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: EthProvider }).ethereum;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const projectId = process.env.NEXT_PUBLIC_CDP_PROJECT_ID?.trim();
  const [address, setAddress] = useState<Address | null>(null);
  const [status, setStatus] = useState<WalletStatus>(projectId ? "idle" : "unavailable");
  const [busy, setBusy] = useState(false);
  const addressRef = useRef<Address | null>(null);
  const cdpOperationsRef = useRef<CdpWalletOperations | null>(null);
  const cdpEnsureRef = useRef<(() => Promise<Address>) | null>(null);

  const setCdpOperations = useCallback((operations: CdpWalletOperations | null) => {
    cdpOperationsRef.current = operations;
  }, []);

  const setCdpEnsure = useCallback((ensure: (() => Promise<Address>) | null) => {
    cdpEnsureRef.current = ensure;
  }, []);

  const setExternalWallet = useCallback((next: Address | null) => {
    addressRef.current = next;
    setAddress(next);
    setStatus(next ? "ready" : projectId ? "idle" : "unavailable");
  }, [projectId]);

  const ensureWallet = useCallback(async () => {
    if (addressRef.current) return addressRef.current;
    if (projectId) {
      setBusy(true);
      try {
        const started = Date.now();
        while (!cdpEnsureRef.current) {
          if (Date.now() - started > 15_000) throw new Error("cdp_not_ready");
          await new Promise((resolve) => window.setTimeout(resolve, 50));
        }
        const next = await cdpEnsureRef.current();
        setExternalWallet(next);
        return next;
      } finally {
        setBusy(false);
      }
    }
    const eth = getEthereum();
    if (!eth) throw new Error("wallet_unavailable");
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    const next = accounts[0] as Address | undefined;
    if (!next) throw new Error("wallet_unavailable");
    setExternalWallet(next);
    return next;
  }, [projectId, setExternalWallet]);

  const ensureDeployed = useCallback(async () => {
    if (!projectId) return;
    await ensureWallet();
    setBusy(true);
    try {
      if (!cdpOperationsRef.current) throw new Error("wallet_unavailable");
      await cdpOperationsRef.current.ensureDeployed();
    } finally {
      setBusy(false);
    }
  }, [ensureWallet, projectId]);

  const signTypedData = useCallback(async (params: WalletTypedData) => {
    const from = addressRef.current ?? await ensureWallet();
    const typed = withEip712Domain(params);
    setBusy(true);
    try {
      if (projectId) {
        if (!cdpOperationsRef.current) throw new Error("wallet_unavailable");
        return await cdpOperationsRef.current.signTypedData(typed);
      }
      const eth = getEthereum();
      if (!eth) throw new Error("wallet_unavailable");
      return await eth.request({
        method: "eth_signTypedData_v4",
        params: [from, JSON.stringify(typed)],
      }) as Hex;
    } finally {
      setBusy(false);
    }
  }, [ensureWallet, projectId]);

  const sendTransaction = useCallback(async (tx: TxRequest) => {
    const from = addressRef.current ?? await ensureWallet();
    setBusy(true);
    try {
      if (projectId) {
        if (!cdpOperationsRef.current) throw new Error("wallet_unavailable");
        await cdpOperationsRef.current.ensureDeployed();
        return await cdpOperationsRef.current.sendTransaction(tx);
      }
      const eth = getEthereum();
      if (!eth) throw new Error("wallet_unavailable");
      const chainIdHex = `0x${CHAIN_ID.toString(16)}`;
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
      const confirmed = await eth.request({ method: "eth_chainId" });
      if (confirmed !== chainIdHex) throw new Error("wrong_network");
      return await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: tx.to, data: tx.data ?? "0x", value: tx.value === undefined ? undefined : `0x${tx.value.toString(16)}` }],
      }) as Hash;
    } finally {
      setBusy(false);
    }
  }, [ensureWallet, projectId]);

  const waitForReceipt = useCallback(async (hash: Hash) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("transaction_reverted");
    return receipt;
  }, []);
  const value = useMemo<WispWallet>(() => ({
    status: busy ? "busy" : status,
    address,
    chainId: address ? CHAIN_ID : null,
    ensureWallet,
    ensureDeployed,
    signTypedData,
    sendTransaction,
    waitForReceipt,
    setExternalWallet,
  }), [address, busy, ensureDeployed, ensureWallet, sendTransaction, signTypedData, status, waitForReceipt, setExternalWallet]);

  return (
    <WalletCtx.Provider value={value}>
      {projectId ? (
        <CdpWalletBridge
          projectId={projectId}
          onAddress={setExternalWallet}
          onOperations={setCdpOperations}
          onEnsureWallet={setCdpEnsure}
          onUnavailable={() => setStatus("unavailable")}
        />
      ) : null}
      {children}
    </WalletCtx.Provider>
  );
}

function CdpWalletBridge({ projectId, onAddress, onOperations, onEnsureWallet, onUnavailable }: {
  projectId: string;
  onAddress: (address: Address | null) => void;
  onOperations: (operations: CdpWalletOperations | null) => void;
  onEnsureWallet: (ensure: (() => Promise<Address>) | null) => void;
  onUnavailable: () => void;
}) {
  const [Ready, setReady] = useState<React.ComponentType<{
    projectId: string;
    onAddress: (address: Address | null) => void;
    onOperations: (operations: CdpWalletOperations | null) => void;
    onEnsureWallet: (ensure: (() => Promise<Address>) | null) => void;
  }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("./CdpBridge").then((mod) => {
      if (!cancelled) setReady(() => mod.CdpBridge);
    }).catch(() => {
      onAddress(null);
      onOperations(null);
      onEnsureWallet(null);
      onUnavailable();
    });
    return () => { cancelled = true; };
  }, [onAddress, onEnsureWallet, onOperations, onUnavailable]);

  if (!Ready) return null;
  return (
    <Ready
      projectId={projectId}
      onAddress={onAddress}
      onOperations={onOperations}
      onEnsureWallet={onEnsureWallet}
    />
  );
}

export function useWispWallet(): WispWallet {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWispWallet requires WalletProvider");
  return ctx;
}
