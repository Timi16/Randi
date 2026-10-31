"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { formatAmount, shortAddress } from "@/lib/format";
import { PayError, preparePayment, signAndSubmit, type PreparedPayment } from "@/lib/stellar-pay";
import type { Checkout } from "@/lib/types";
import { connectWallet, listWallets, WALLET_TILE, WalletError, walletName, type WalletKind, type WalletOption } from "@/lib/wallets";
import styles from "./pay.module.css";

type Stage =
  | { step: "pick" }
  | { step: "connecting"; kind: WalletKind }
  | { step: "review"; kind: WalletKind; prepared: PreparedPayment }
  | { step: "signing"; kind: WalletKind; prepared: PreparedPayment };

interface Props {
  checkout: Checkout;
  onClose: () => void;
  onManual: () => void;
  /** The payment went to Stellar (hash known), or may have (note explains). */
  onSent: (hash: string | null, note: string | null) => void;
}

const messageOf = (err: unknown) =>
  err instanceof WalletError || err instanceof PayError ? err.message : "That didn't go through. Nothing was sent. Try again.";

/**
 * "Pay with a wallet" (§6.3): pick Freighter, xBull or Albedo; the wallet must be on Testnet;
 * the account is checked for a USDC trustline and balance before anything is signed; the
 * customer reviews, signs, and the payment is submitted exactly once.
 */
export function WalletSheet({ checkout, onClose, onManual, onSent }: Props) {
  const [stage, setStage] = useState<Stage>({ step: "pick" });
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = stage.step === "connecting" || stage.step === "signing";

  useEffect(() => {
    let live = true;
    listWallets()
      .then((list) => live && setWallets(list))
      .catch(() => live && setWallets([]));
    return () => {
      live = false;
    };
  }, []);

  const pick = async (kind: WalletKind) => {
    setError(null);
    setStage({ step: "connecting", kind });
    try {
      const payer = await connectWallet(kind);
      const prepared = await preparePayment(payer, {
        destination: checkout.wallet,
        asset: checkout.asset,
        amount: checkout.usdcRemaining,
        memo: checkout.reference,
      });
      setStage({ step: "review", kind, prepared });
    } catch (err) {
      setError(messageOf(err));
      setStage({ step: "pick" });
    }
  };

  const confirm = async () => {
    if (stage.step !== "review") return;
    const { kind, prepared } = stage;
    setError(null);
    setStage({ step: "signing", kind, prepared });
    try {
      const hash = await signAndSubmit(kind, prepared);
      onSent(hash, null);
    } catch (err) {
      if (err instanceof PayError && err.code === "UNCONFIRMED") {
        onSent(err.hash, err.message);
        return;
      }
      setError(messageOf(err));
      setStage({ step: "review", kind, prepared });
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  const amount = formatAmount(checkout.usdcRemaining);

  return (
    <Dialog title={stage.step === "pick" ? "Connect a wallet" : stage.step === "connecting" ? `Opening ${walletName(stage.kind)}` : "Check and pay"} onClose={close} subtitle={stage.step === "pick" ? "Make sure it's on Stellar Testnet." : undefined}>
      {error && (
        <div className="alert" role="alert">
          <Icon name="alert" size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {stage.step === "pick" && (
        <div className="stack" style={{ gap: 10 }}>
          {wallets === null
            ? [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 70, borderRadius: 16 }} />)
            : wallets.map((w) => {
                const inner = (
                  <>
                    <span className={styles.walletIcon} aria-hidden="true" style={WALLET_TILE[w.kind]}>
                      {w.letter}
                    </span>
                    <span className="stack" style={{ gap: 0, flex: 1 }}>
                      <span style={{ fontWeight: 800 }}>{w.name}</span>
                      <span className="hint">{w.available ? (w.kind === "freighter" ? "Browser extension" : "Opens in a new window, no install needed") : "Not installed in this browser"}</span>
                    </span>
                  </>
                );
                return w.available ? (
                  <button key={w.kind} type="button" className={styles.walletOpt} onClick={() => void pick(w.kind)}>
                    {inner}
                    <Icon name="arrowRight" size={18} />
                  </button>
                ) : (
                  <div key={w.kind} className={styles.walletOpt} style={{ cursor: "default", opacity: 0.75 }}>
                    {inner}
                    <a href={w.url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                      Get it
                    </a>
                  </div>
                );
              })}
          <button type="button" className="btn btn-ghost btn-block" onClick={onManual}>
            Pay from any other wallet instead
          </button>
        </div>
      )}

      {stage.step === "connecting" && (
        <div className={styles.center} role="status">
          <span className={styles.bigSpinner} />
          <strong>Approve the connection in {walletName(stage.kind)}.</strong>
          <span className="hint">Then we check your account can pay before you sign anything.</span>
        </div>
      )}

      {(stage.step === "review" || stage.step === "signing") && (
        <div className="stack" style={{ gap: 12 }}>
          <div className={styles.review}>
            <ReviewRow label="From" value={`${walletName(stage.kind)} · ${shortAddress(stage.prepared.payer)}`} mono />
            <ReviewRow label="Your balance" value={`${formatAmount(stage.prepared.balance)} USDC`} />
            <ReviewRow label="To" value={`${checkout.businessName} · ${shortAddress(checkout.wallet)}`} />
            <ReviewRow label="Memo" value={checkout.reference} mono />
            <ReviewRow label="Network" value="Stellar Testnet" />
          </div>
          <div className={styles.sendTotal}>
            <span style={{ fontSize: 13, color: "var(--on-dark-2)" }}>You send</span>
            <span style={{ fontWeight: 900, fontSize: 26, letterSpacing: "-0.04em" }}>
              {amount} <span style={{ fontSize: 13, color: "var(--sun)" }}>USDC</span>
            </span>
          </div>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={confirm} disabled={stage.step === "signing"} aria-busy={stage.step === "signing"}>
            {stage.step === "signing" ? (
              <>
                <span className="spinner" /> Approve in {walletName(stage.kind)}…
              </>
            ) : (
              `Pay ${amount} USDC`
            )}
          </button>
          {stage.step === "review" && (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setStage({ step: "pick" })}>
              Use another wallet
            </button>
          )}
        </div>
      )}
    </Dialog>
  );
}

function ReviewRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.detailRow} style={{ justifyContent: "space-between" }}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={`${styles.detailValue} ${mono ? "mono" : ""}`} style={{ textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}
