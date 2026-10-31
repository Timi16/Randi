"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { Icon } from "@/components/Icon";
import { api, errorMessage } from "@/lib/api";
import type { Wallet } from "@/lib/types";

const REASON: Record<string, string> = {
  ACCOUNT_NOT_FOUND: "This account isn't funded on Testnet yet. Get test XLM from Friendbot.",
  NO_TRUSTLINE: "Add a USDC trustline in your wallet (Circle's testnet issuer).",
  TRUSTLINE_LIMIT_TOO_LOW: "The USDC trustline limit is too low. Raise it in your wallet.",
};

export function cannotReceiveText(wallet: Wallet): string | null {
  const check = wallet.canReceive.USDC;
  if (!check || check.canReceive) return null;
  return REASON[check.reason ?? ""] ?? "This wallet can't receive USDC right now.";
}

/** The three checks a receiving wallet must pass, with "Check again". */
export function WalletChecks({ wallet, onUpdated }: { wallet: Wallet; onUpdated?: (w: Wallet) => void }) {
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usdc = wallet.canReceive.USDC;
  const hasLine = wallet.trustlines.some((t) => t.code === "USDC");
  const rows: { ok: boolean; title: string; fix: string | null }[] = [
    { ok: wallet.verified, title: "Proved it's yours", fix: wallet.verified ? null : "Sign once with Freighter or xBull. No money moves." },
    { ok: wallet.accountExists, title: "Account exists on Testnet", fix: wallet.accountExists ? null : REASON.ACCOUNT_NOT_FOUND ?? null },
    { ok: hasLine && Boolean(usdc?.canReceive), title: "Can receive USDC", fix: usdc?.canReceive ? null : cannotReceiveText(wallet) },
  ];

  const recheck = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ wallet: Wallet }>(`/v1/wallets/${wallet.id}/refresh`);
      onUpdated?.(res.wallet);
      void mutate("/v1/wallets");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map((r) => (
        <div key={r.title} className="row" style={{ alignItems: "flex-start", padding: "10px 12px", borderRadius: 14, background: r.ok ? "var(--paid-soft)" : "var(--sun-soft)" }}>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: r.ok ? "var(--paid)" : "var(--ink)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name={r.ok ? "check" : "alert"} size={14} stroke={3} />
          </span>
          <span className="stack" style={{ gap: 2 }}>
            <strong style={{ fontSize: 14 }}>{r.title}</strong>
            {r.fix && <span style={{ fontSize: 13, color: "var(--sun-fg)" }}>{r.fix}</span>}
          </span>
        </div>
      ))}
      {error && <span className="field-error">{error}</span>}
      <button type="button" className="btn btn-outline btn-sm" style={{ alignSelf: "flex-start" }} onClick={recheck} disabled={busy}>
        {busy ? <span className="spinner" /> : <Icon name="refresh" size={15} />} Check again
      </button>
    </div>
  );
}
