"use client";

import { HORIZON_URL, NETWORK_PASSPHRASE } from "./config";
import { formatAmount, toStroops } from "./format";
import type { AssetRef } from "./types";
import { signTransaction, type WalletKind } from "./wallets";

export type PayErrorCode = "NO_ACCOUNT" | "NO_TRUSTLINE" | "INSUFFICIENT" | "SUBMIT_FAILED" | "UNCONFIRMED" | "NETWORK";

export class PayError extends Error {
  constructor(
    readonly code: PayErrorCode,
    message: string,
    /** Set when the transaction may have been sent (UNCONFIRMED). */
    readonly hash: string | null = null,
  ) {
    super(message);
    this.name = "PayError";
  }
}

export interface PayParams {
  destination: string;
  asset: AssetRef;
  /** Decimal string, e.g. "27.0300000". */
  amount: string;
  /** The request's text memo (the payment reference). */
  memo: string;
}

export interface PreparedPayment {
  payer: string;
  xdr: string;
  /** What the payer holds of the asset, for the review screen. */
  balance: string;
}

/**
 * Checks the payer's account can make the payment (funded, USDC trustline, enough balance)
 * and builds it with the reference as a text memo. Nothing is signed yet. The Stellar SDK is
 * loaded only when this runs, so the payment page itself stays light.
 */
export async function preparePayment(payer: string, params: PayParams): Promise<PreparedPayment> {
  const sdk = await import("@stellar/stellar-sdk");
  const server = new sdk.Horizon.Server(HORIZON_URL);
  let account;
  try {
    account = await server.loadAccount(payer);
  } catch (err) {
    if ((err as { response?: { status?: number } }).response?.status === 404) {
      throw new PayError("NO_ACCOUNT", "This account isn't funded on Testnet yet. Get test XLM from Friendbot first.");
    }
    throw new PayError("NETWORK", "Couldn't reach Stellar. Check your connection and try again.");
  }
  const code = params.asset.code;
  const line = account.balances.find(
    (b) => "asset_code" in b && b.asset_code === code && "asset_issuer" in b && b.asset_issuer === params.asset.issuer,
  );
  if (!line) {
    throw new PayError("NO_TRUSTLINE", `This account can't hold ${code} yet. Add a ${code} trustline in your wallet, then get test ${code} from Circle's faucet.`);
  }
  if (toStroops(line.balance) < toStroops(params.amount)) {
    throw new PayError("INSUFFICIENT", `Not enough ${code}: this account has ${formatAmount(line.balance)} and the request needs ${formatAmount(params.amount)}.`);
  }
  const asset = new sdk.Asset(code, params.asset.issuer as string);
  const fee = await server.fetchBaseFee().catch(() => 100);
  const tx = new sdk.TransactionBuilder(account, { fee: String(fee * 10), networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(sdk.Operation.payment({ destination: params.destination, asset, amount: params.amount }))
    .addMemo(sdk.Memo.text(params.memo))
    .setTimeout(180)
    .build();
  return { payer, xdr: tx.toXDR(), balance: line.balance };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Has the wallet sign the prepared payment and submits it once. If the submit times out or the
 * connection drops, it looks the transaction up by hash instead of sending it again: a payment
 * is never submitted twice.
 */
export async function signAndSubmit(kind: WalletKind, prepared: PreparedPayment, onSigned?: (hash: string) => void): Promise<string> {
  const signedXdr = await signTransaction(kind, prepared.xdr, prepared.payer);
  const sdk = await import("@stellar/stellar-sdk");
  const server = new sdk.Horizon.Server(HORIZON_URL);
  const signed = sdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const hash = Array.from(signed.hash(), (b) => b.toString(16).padStart(2, "0")).join("");
  onSigned?.(hash);
  try {
    const res = await server.submitTransaction(signed);
    return res.hash;
  } catch (err) {
    const response = (err as { response?: { status?: number; data?: { extras?: { result_codes?: { operations?: string[]; transaction?: string } } } } }).response;
    const codes = response?.data?.extras?.result_codes;
    if (codes) {
      const op = codes.operations?.[0];
      if (op === "op_no_trust" || op === "op_line_full" || op === "op_no_destination") {
        throw new PayError("SUBMIT_FAILED", "The business's wallet can't receive this payment right now. Nothing was sent. Let them know.");
      }
      if (op === "op_underfunded") throw new PayError("SUBMIT_FAILED", "Not enough USDC to cover this payment. Nothing was sent.");
      if (codes.transaction === "tx_bad_seq") throw new PayError("SUBMIT_FAILED", "Your wallet sent another transaction at the same time. Nothing was sent. Try again.");
      throw new PayError("SUBMIT_FAILED", "Stellar didn't accept the payment. Nothing was sent. Try again.");
    }
    // Timeout or dropped connection: it may have gone through. Look it up; never resubmit.
    for (let i = 0; i < 6; i += 1) {
      await sleep(i === 0 ? 1500 : 4000);
      try {
        const found = await server.transactions().transaction(hash).call();
        if (found.successful) return hash;
        throw new PayError("SUBMIT_FAILED", "Stellar didn't accept the payment. Nothing was sent. Try again.");
      } catch (lookupErr) {
        if (lookupErr instanceof PayError) throw lookupErr;
      }
    }
    throw new PayError("UNCONFIRMED", "We couldn't confirm the payment was sent. Don't pay again yet: this page updates by itself if it went through.", hash);
  }
}
