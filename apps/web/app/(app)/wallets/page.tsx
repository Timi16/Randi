"use client";

import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { CopyButton } from "@/components/CopyButton";
import { Dialog } from "@/components/Dialog";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { api, errorMessage } from "@/lib/api";
import { explorerAccount } from "@/lib/config";
import { formatDate, shortAddress } from "@/lib/format";
import { useMe, useWallets } from "@/lib/session";
import type { Merchant, Wallet } from "@/lib/types";
import { ConnectWalletDialog } from "./_components/ConnectWalletDialog";
import { cannotReceiveText, WalletChecks } from "./_components/WalletChecks";

export default function WalletsPage() {
  const { data, error, isLoading, mutate } = useWallets();
  const { merchant, mutate: mutateMe } = useMe();
  const toast = useToast();
  const [connect, setConnect] = useState<{ verify?: Wallet } | null>(null);
  const [removing, setRemoving] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);
  const wallets = data?.data ?? [];

  const makeDefault = async (wallet: Wallet) => {
    try {
      const res = await api.post<{ merchant: Merchant }>("/auth/settings", { defaultWalletId: wallet.id });
      await mutateMe(res, { revalidate: false });
      toast(`${wallet.label ?? shortAddress(wallet.address)} is now the default`);
    } catch (err) {
      toast(errorMessage(err));
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/v1/wallets/${removing.id}`);
      await mutate();
      toast("Wallet removed");
      setRemoving(null);
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Wallets"
        kicker="Where your USDC lands"
        actions={
          <button type="button" className="btn btn-primary btn-sm hide-sm" onClick={() => setConnect({})}>
            <Icon name="plus" size={15} stroke={3} /> Connect a wallet
          </button>
        }
      />
      <div className="content">
        <button type="button" className="btn btn-primary btn-block only-narrow" onClick={() => setConnect({})}>
          Connect a wallet
        </button>
        {error && <div className="alert">{errorMessage(error)}</div>}
        {isLoading && <div className="skeleton" style={{ height: 180 }} />}
        {!isLoading && !error && wallets.length === 0 && (
          <div className="card">
            <EmptyState
              title="No wallet yet"
              action={
                <button type="button" className="btn btn-primary" onClick={() => setConnect({})}>
                  Connect your first wallet
                </button>
              }
            >
              Payments go straight to your own Stellar wallet. Randi never holds money or asks for a secret key.
            </EmptyState>
          </div>
        )}
        <div className="grid-2">
          {wallets.map((w) => {
            const isDefault = merchant?.defaultWalletId === w.id;
            const problem = cannotReceiveText(w);
            return (
              <article key={w.id} className="card stack" style={{ gap: 14 }}>
                <div className="between" style={{ alignItems: "flex-start" }}>
                  <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                    <strong style={{ fontSize: 17 }}>{w.label ?? "Wallet"}</strong>
                    <a className="mono" href={explorerAccount(w.address)} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--muted)" }} title={w.address}>
                      {shortAddress(w.address, 6, 6)}
                    </a>
                  </div>
                  {isDefault && <span className="pill tone-neutral">Default</span>}
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className={`pill ${w.verified ? "tone-good" : "tone-warn"}`}>
                    <Icon name={w.verified ? "check" : "alert"} size={13} stroke={2.6} />
                    {w.verified ? "Verified" : "Not verified"}
                  </span>
                  <span className={`pill ${problem ? "tone-warn" : "tone-good"}`}>
                    <Icon name={problem ? "alert" : "check"} size={13} stroke={2.6} />
                    {problem ? "Can't take USDC" : "Takes USDC"}
                  </span>
                </div>
                <WalletChecks wallet={w} />
                <div className="row wrap" style={{ gap: 6, borderTop: "1px solid var(--row)", paddingTop: 12 }}>
                  {!w.verified && (
                    <button type="button" className="btn btn-dark btn-sm" onClick={() => setConnect({ verify: w })}>
                      Verify with a wallet
                    </button>
                  )}
                  {w.verified && !isDefault && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => void makeDefault(w)}>
                      Make default
                    </button>
                  )}
                  <CopyButton value={w.address} label="Copy address" />
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto", color: "var(--danger-fg)" }} onClick={() => setRemoving(w)}>
                    <Icon name="trash" size={15} /> Remove
                  </button>
                </div>
                <span className="hint">Added {formatDate(w.createdAt)}</span>
              </article>
            );
          })}
        </div>
      </div>
      {connect && (
        <ConnectWalletDialog
          existing={wallets}
          verifyWallet={connect.verify}
          onClose={() => setConnect(null)}
          onDone={(w) => {
            if (w.verified && !merchant?.defaultWalletId) void makeDefault(w);
          }}
        />
      )}
      {removing && (
        <Dialog title="Remove this wallet?" onClose={() => setRemoving(null)}>
          <span>
            {removing.label ?? shortAddress(removing.address)} won&apos;t be offered for new requests. Requests already sent to it keep working and still get checked.
          </span>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
              Keep it
            </button>
            <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={remove} disabled={busy}>
              {busy && <span className="spinner" />} Remove wallet
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
