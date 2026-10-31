"use client";

import { NETWORK_PASSPHRASE } from "./config";

/**
 * The wallets Randi offers, each through its own library (the same ones Stellar Wallets Kit
 * wraps, without the kit's dozens of other wallets and their dependencies). Albedo can pay
 * but can't produce a SEP-53 message signature, so it can't prove a merchant's wallet.
 */
export type WalletKind = "freighter" | "xbull" | "albedo";

export interface WalletOption {
  kind: WalletKind;
  name: string;
  /** One letter for the wallet's tile. */
  letter: string;
  url: string;
  available: boolean;
  canSignMessage: boolean;
}

export type WalletErrorCode = "NOT_AVAILABLE" | "REJECTED" | "WRONG_NETWORK" | "WRONG_ACCOUNT" | "FAILED";

export class WalletError extends Error {
  constructor(
    readonly code: WalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletError";
  }
}

const NAMES: Record<WalletKind, string> = { freighter: "Freighter", xbull: "xBull", albedo: "Albedo" };
const URLS: Record<WalletKind, string> = { freighter: "https://www.freighter.app", xbull: "https://xbull.app", albedo: "https://albedo.link" };

const MESSAGES: Record<WalletErrorCode, (name: string) => string> = {
  NOT_AVAILABLE: (n) => `${n} isn't available in this browser. Install it, or pay from any other wallet below.`,
  REJECTED: (n) => `You cancelled in ${n}. Nothing was sent. Try again when you're ready.`,
  WRONG_NETWORK: () => "Switch your wallet to Testnet, then try again.",
  WRONG_ACCOUNT: (n) => `${n} signed with a different account. Pick the right account, then try again.`,
  FAILED: (n) => `${n} couldn't complete that. Try again.`,
};

const fail = (code: WalletErrorCode, kind: WalletKind) => new WalletError(code, MESSAGES[code](NAMES[kind]));

function toError(error: unknown, kind: WalletKind): WalletError {
  if (error instanceof WalletError) return error;
  const text = typeof error === "string" ? error : ((error as { message?: string } | null)?.message ?? "");
  return fail(/declin|reject|denied|cancel|closed/i.test(text) ? "REJECTED" : "FAILED", kind);
}

// Each library loads only when that wallet is used, so pages that never pay stay light.
const freighter = () => import("@stellar/freighter-api");
const albedo = async () => (await import("@albedo-link/intent")).default;
async function withXBull<T>(fn: (bridge: import("@creit.tech/xbull-wallet-connect").xBullWalletConnect) => Promise<T>): Promise<T> {
  const { xBullWalletConnect } = await import("@creit.tech/xbull-wallet-connect");
  const bridge = new xBullWalletConnect();
  try {
    return await fn(bridge);
  } finally {
    bridge.closeConnections();
  }
}

async function freighterInstalled(): Promise<boolean> {
  try {
    const res = await (await freighter()).isConnected();
    return !res.error && res.isConnected;
  } catch {
    return false;
  }
}

export async function listWallets(): Promise<WalletOption[]> {
  const freighterOk = await freighterInstalled();
  // xBull (web app or extension) and Albedo open in a popup, so they work in any browser.
  return (["freighter", "xbull", "albedo"] as WalletKind[]).map((kind) => ({
    kind,
    name: NAMES[kind],
    letter: kind === "xbull" ? "x" : NAMES[kind].charAt(0),
    url: URLS[kind],
    available: kind === "freighter" ? freighterOk : true,
    canSignMessage: kind !== "albedo",
  }));
}

/** Asks the wallet for its account and, where the wallet can tell us, checks it is on Testnet. */
export async function connectWallet(kind: WalletKind): Promise<string> {
  try {
    if (kind === "freighter") {
      if (!(await freighterInstalled())) throw fail("NOT_AVAILABLE", kind);
      const api = await freighter();
      const access = await api.requestAccess();
      if (access.error || !access.address) throw toError(access.error, kind);
      const network = await api.getNetworkDetails();
      if (network.error) throw toError(network.error, kind);
      if (network.networkPassphrase !== NETWORK_PASSPHRASE) throw fail("WRONG_NETWORK", kind);
      return access.address;
    }
    if (kind === "xbull") return await withXBull((bridge) => bridge.connect());
    // Albedo signs for whichever network we pass, which is always Testnet.
    return (await (await albedo()).publicKey({})).pubkey;
  } catch (err) {
    throw toError(err, kind);
  }
}

/** Signs a transaction envelope with `address` and returns the signed XDR. */
export async function signTransaction(kind: WalletKind, xdr: string, address: string): Promise<string> {
  try {
    if (kind === "freighter") {
      const res = await (await freighter()).signTransaction(xdr, { address, networkPassphrase: NETWORK_PASSPHRASE });
      if (res.error || !res.signedTxXdr) throw toError(res.error, kind);
      if (res.signerAddress && res.signerAddress !== address) throw fail("WRONG_ACCOUNT", kind);
      return res.signedTxXdr;
    }
    if (kind === "xbull") return await withXBull((bridge) => bridge.sign({ xdr, publicKey: address, network: NETWORK_PASSPHRASE }));
    const res = await (await albedo()).tx({ xdr, pubkey: address, network: "testnet" });
    return res.signed_envelope_xdr;
  } catch (err) {
    throw toError(err, kind);
  }
}

/**
 * Signs a plain message (SEP-53) with `address`: the wallet proof. Moves no money and costs no
 * fee. Returns the signature as base64, which is what the API's verification expects.
 */
export async function signMessage(kind: WalletKind, message: string, address: string): Promise<string> {
  if (kind === "albedo") throw fail("FAILED", kind);
  try {
    if (kind === "freighter") {
      const res = await (await freighter()).signMessage(message, { address, networkPassphrase: NETWORK_PASSPHRASE });
      if (res.error || !res.signedMessage) throw toError(res.error, kind);
      if (res.signerAddress && res.signerAddress !== address) throw fail("WRONG_ACCOUNT", kind);
      if (typeof res.signedMessage === "string") return res.signedMessage;
      // Older Freighter versions return the raw bytes.
      let binary = "";
      for (const byte of new Uint8Array(res.signedMessage)) binary += String.fromCharCode(byte);
      return btoa(binary);
    }
    const res = await withXBull((bridge) => bridge.signMessage(message, { address, networkPassphrase: NETWORK_PASSPHRASE }));
    if (res.signerAddress && res.signerAddress !== address) throw fail("WRONG_ACCOUNT", kind);
    return res.signedMessage;
  } catch (err) {
    throw toError(err, kind);
  }
}

export const walletName = (kind: WalletKind) => NAMES[kind];

/** Letter tiles as in the design: no third-party images on the payment page. */
export const WALLET_TILE: Record<WalletKind, React.CSSProperties> = {
  freighter: { background: "var(--ink)", color: "#fff" },
  xbull: { background: "var(--sun)", color: "var(--ink)" },
  albedo: { background: "var(--sand)", color: "var(--ink)" },
};

