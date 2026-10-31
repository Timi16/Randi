"use client";

import type { ModuleInterface } from "@creit.tech/stellar-wallets-kit/types";
import { NETWORK_PASSPHRASE } from "./config";

/** The wallets Randi offers. Albedo can pay but can't sign a message, so it can't prove a wallet. */
export type WalletKind = "freighter" | "xbull" | "albedo";

export interface WalletOption {
  kind: WalletKind;
  name: string;
  icon: string;
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

const MESSAGES: Record<WalletErrorCode, (name: string) => string> = {
  NOT_AVAILABLE: (n) => `${n} isn't available in this browser. Install it, or pay from any other wallet below.`,
  REJECTED: (n) => `You cancelled in ${n}. Nothing was sent. Try again when you're ready.`,
  WRONG_NETWORK: () => "Switch your wallet to Testnet, then try again.",
  WRONG_ACCOUNT: (n) => `${n} signed with a different account. Pick the right account, then try again.`,
  FAILED: (n) => `${n} couldn't complete that. Try again.`,
};

const fail = (code: WalletErrorCode, name: string) => new WalletError(code, MESSAGES[code](name));

function toError(error: unknown, name: string): WalletError {
  if (error instanceof WalletError) return error;
  const text = typeof error === "string" ? error : ((error as { message?: string } | null)?.message ?? "");
  return fail(/declin|reject|denied|cancel|closed/i.test(text) ? "REJECTED" : "FAILED", name);
}

let modules: Promise<Record<WalletKind, ModuleInterface>> | null = null;

/** Loads the three wallet modules on first use, so pages that never pay stay light. */
function loadModules(): Promise<Record<WalletKind, ModuleInterface>> {
  modules ??= Promise.all([
    import("@creit.tech/stellar-wallets-kit/modules/varial"),
    import("@creit.tech/stellar-wallets-kit/modules/xbull"),
    import("@creit.tech/stellar-wallets-kit/modules/albedo"),
  ]).then(([varial, xbull, albedo]) => ({
    freighter: new varial.VarialModule(),
    xbull: new xbull.xBullModule(),
    albedo: new albedo.AlbedoModule(),
  }));
  return modules;
}

const NAMES: Record<WalletKind, string> = { freighter: "Freighter", xbull: "xBull", albedo: "Albedo" };

export async function listWallets(): Promise<WalletOption[]> {
  const mods = await loadModules();
  const kinds: WalletKind[] = ["freighter", "xbull", "albedo"];
  return Promise.all(
    kinds.map(async (kind) => {
      const mod = mods[kind];
      const available = await mod.isAvailable().catch(() => false);
      return { kind, name: NAMES[kind], icon: mod.productIcon, url: mod.productUrl, available, canSignMessage: kind !== "albedo" };
    }),
  );
}

/** Asks the wallet for its account and makes sure it is on Testnet. Returns the G address. */
export async function connectWallet(kind: WalletKind): Promise<string> {
  const mod = (await loadModules())[kind];
  const name = NAMES[kind];
  if (!(await mod.isAvailable().catch(() => false))) throw fail("NOT_AVAILABLE", name);
  let address: string;
  try {
    ({ address } = await mod.getAddress({}));
  } catch (err) {
    throw toError(err, name);
  }
  if (!address) throw fail("FAILED", name);
  // Albedo can't report its network; it signs for the passphrase we pass, which is always Testnet.
  if (kind !== "albedo") {
    const network = await mod.getNetwork().catch(() => null);
    if (network && network.networkPassphrase !== NETWORK_PASSPHRASE) throw fail("WRONG_NETWORK", name);
  }
  return address;
}

/** Signs a transaction envelope with `address` and returns the signed XDR. */
export async function signTransaction(kind: WalletKind, xdr: string, address: string): Promise<string> {
  const mod = (await loadModules())[kind];
  const name = NAMES[kind];
  try {
    const res = await mod.signTransaction(xdr, { address, networkPassphrase: NETWORK_PASSPHRASE });
    if (res.signerAddress && res.signerAddress !== address) throw fail("WRONG_ACCOUNT", name);
    return res.signedTxXdr;
  } catch (err) {
    throw toError(err, name);
  }
}

/**
 * Signs a plain message (SEP-53) with `address`: the wallet proof. Moves no money and costs no
 * fee. Returns the signature as base64, which is what the API's verification expects.
 */
export async function signMessage(kind: WalletKind, message: string, address: string): Promise<string> {
  const mod = (await loadModules())[kind];
  const name = NAMES[kind];
  try {
    const res = await mod.signMessage(message, { address, networkPassphrase: NETWORK_PASSPHRASE });
    if (res.signerAddress && res.signerAddress !== address) throw fail("WRONG_ACCOUNT", name);
    return res.signedMessage;
  } catch (err) {
    throw toError(err, name);
  }
}

export const walletName = (kind: WalletKind) => NAMES[kind];
