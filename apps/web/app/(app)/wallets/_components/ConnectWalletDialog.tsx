"use client";

import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { api, ApiError, errorMessage } from "@/lib/api";
import { looksLikeAddress, looksLikeSecret, shortAddress } from "@/lib/format";
import type { ChallengeResponse, Wallet } from "@/lib/types";
import { connectWallet, listWallets, signMessage, WALLET_TILE, WalletError, walletName, type WalletKind, type WalletOption } from "@/lib/wallets";
import { WalletChecks } from "./WalletChecks";

type Step =
  | { step: "pick" }
  | { step: "paste" }
  | { step: "working"; text: string }
  | { step: "checks"; wallet: Wallet };

interface Props {
  onClose: () => void;
  /** Called with the wallet the merchant chose to use. */
  onDone?: (wallet: Wallet) => void;
  /** Verify an existing (pasted) wallet instead of adding a new one. */
  verifyWallet?: Wallet;
  existing: Wallet[];
}

function verifyError(err: unknown): string {
  if (err instanceof WalletError) return err.message;
  if (err instanceof ApiError) {
    if (err.code === "INVALID_SIGNATURE") return "That signature doesn't match this wallet. Pick the same account in your wallet, then try again.";
    if (err.code === "CHALLENGE_EXPIRED") return "That took too long and the message expired. Try again.";
    if (err.code === "WALLET_TAKEN") return "This wallet is already connected to another Randi account.";
    if (err.code === "SECRET_KEY_REJECTED") return "That's a secret key. Never share it. Paste the address that starts with G.";
  }
  return errorMessage(err);
}

/**
 * Connect a wallet (docs/Frontend.md §5.7): 1. pick Freighter, xBull or paste an address;
 * 2. sign the proof message (no money moves); 3. Randi checks the account and USDC trustline.
 */
export function ConnectWalletDialog({ onClose, onDone, verifyWallet, existing }: Props) {
  const { mutate } = useSWRConfig();
  const [step, setStep] = useState<Step>({ step: "pick" });
  const [options, setOptions] = useState<WalletOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    let live = true;
    listWallets()
      .then((list) => live && setOptions(list.filter((w) => w.canSignMessage)))
      .catch(() => live && setOptions([]));
    return () => {
      live = false;
    };
  }, []);

  const addOrFind = async (addr: string): Promise<Wallet> => {
    const found = existing.find((w) => w.address === addr);
    if (found) return found;
    const res = await api.post<{ wallet: Wallet }>("/v1/wallets", { address: addr, ...(label.trim() ? { label: label.trim() } : {}) });
    return res.wallet;
  };

  const viaWallet = async (kind: WalletKind) => {
    setError(null);
    setStep({ step: "working", text: `Opening ${walletName(kind)}… approve the connection.` });
    try {
      const addr = await connectWallet(kind);
      if (verifyWallet && addr !== verifyWallet.address) {
        throw new WalletError("WRONG_ACCOUNT", `${walletName(kind)} is on ${shortAddress(addr)}. Switch it to ${shortAddress(verifyWallet.address)}, then try again.`);
      }
      const wallet = verifyWallet ?? (await addOrFind(addr));
      let verified = wallet;
      if (!wallet.verified) {
        const challenge = await api.post<ChallengeResponse>(`/v1/wallets/${wallet.id}/challenge`);
        setStep({ step: "working", text: `Sign the message in ${walletName(kind)}. It proves the wallet is yours. No money moves.` });
        const signature = await signMessage(kind, challenge.message, addr);
        setStep({ step: "working", text: "Checking the signature and the account on Stellar…" });
        verified = (await api.post<{ wallet: Wallet }>(`/v1/wallets/${wallet.id}/verify`, { challengeId: challenge.challengeId, signature })).wallet;
      }
      void mutate("/v1/wallets");
      setStep({ step: "checks", wallet: verified });
    } catch (err) {
      setError(verifyError(err));
      setStep({ step: "pick" });
    }
  };

  const viaPaste = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = address.trim();
    if (looksLikeSecret(addr)) return;
    setError(null);
    setStep({ step: "working", text: "Checking the account on Stellar…" });
    try {
      const wallet = await addOrFind(addr);
      void mutate("/v1/wallets");
      setStep({ step: "checks", wallet });
    } catch (err) {
      setError(verifyError(err));
      setStep({ step: "paste" });
    }
  };

  const secret = looksLikeSecret(address);
  const title = verifyWallet ? "Verify this wallet" : "Connect a wallet";

  return (
    <Dialog title={title} onClose={onClose} subtitle={step.step === "pick" ? "Where your USDC lands. Stellar Testnet only." : undefined}>
      {error && (
        <div className="alert" role="alert">
          <Icon name="alert" size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {step.step === "pick" && (
        <div className="stack" style={{ gap: 10 }}>
          {!verifyWallet && (
            <label className="field">
              <span className="label">Name (optional)</span>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main till" maxLength={64} />
            </label>
          )}
          {options === null
            ? [0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 66 }} />)
            : options.map((w) => (
                <button key={w.kind} type="button" className="btn btn-outline btn-block" style={{ height: 66, justifyContent: "flex-start", gap: 12, borderRadius: 16 }} onClick={() => void viaWallet(w.kind)} disabled={!w.available}>
                  <span aria-hidden="true" style={{ ...WALLET_TILE[w.kind], width: 34, height: 34, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>
                    {w.letter}
                  </span>
                  <span className="stack" style={{ gap: 0, alignItems: "flex-start", flex: 1 }}>
                    <span>{w.name}</span>
                    <span className="hint" style={{ fontWeight: 500 }}>
                      {w.available ? "Connect and sign once" : "Not installed in this browser"}
                    </span>
                  </span>
                  <Icon name="arrowRight" size={18} />
                </button>
              ))}
          {!verifyWallet && (
            <button type="button" className="btn btn-ghost btn-block" style={{ height: 52 }} onClick={() => setStep({ step: "paste" })}>
              <Icon name="key" size={18} /> Paste an address instead
            </button>
          )}
        </div>
      )}

      {step.step === "paste" && (
        <form className="stack" onSubmit={viaPaste}>
          <label className="field">
            <span className="label">Stellar address</span>
            <input
              className="input mono"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="G…"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={secret}
              aria-describedby="address-hint"
            />
            {secret ? (
              <span id="address-hint" className="field-error" role="alert">
                That&apos;s a secret key. Never share it. Paste the address that starts with G.
              </span>
            ) : (
              <span id="address-hint" className="hint">
                The public address that starts with G. You&apos;ll verify it later by signing with Freighter or xBull.
              </span>
            )}
          </label>
          <label className="field">
            <span className="label">Name (optional)</span>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main till" maxLength={64} />
          </label>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => setStep({ step: "pick" })}>
              Back
            </button>
            <button type="submit" className="btn btn-dark" style={{ flex: 1 }} disabled={secret || !looksLikeAddress(address)}>
              Add wallet
            </button>
          </div>
        </form>
      )}

      {step.step === "working" && (
        <div className="stack" role="status" style={{ alignItems: "center", textAlign: "center", padding: "18px 0" }}>
          <span className="spinner" style={{ width: 36, height: 36, borderWidth: 4, color: "var(--protea)" }} />
          <strong>{step.text}</strong>
        </div>
      )}

      {step.step === "checks" && (
        <div className="stack">
          <WalletChecks wallet={step.wallet} onUpdated={(w) => setStep({ step: "checks", wallet: w })} />
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={() => {
              onDone?.(step.wallet);
              onClose();
            }}
          >
            {step.wallet.verified ? "Use this wallet" : "Done"}
          </button>
        </div>
      )}
    </Dialog>
  );
}
