"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { formatRate } from "@/lib/format";
import { useMe, useWallets } from "@/lib/session";
import type { Page, PaymentRequest } from "@/lib/types";
import { ConnectWalletDialog } from "../wallets/_components/ConnectWalletDialog";
import { RateDialog } from "../settings/_components/RateDialog";

/** Onboarding checklist (docs/Frontend.md §5.1): wallet, rate, first request. */
export default function GetStartedPage() {
  const { merchant, mutate } = useMe();
  const { data: wallets } = useWallets();
  const { data: requests } = useSWR<Page<PaymentRequest>>("/v1/payment-requests?limit=1");
  const [dialog, setDialog] = useState<"wallet" | "rate" | null>(null);
  if (!merchant) return null;

  const ready = (wallets?.data ?? []).filter((w) => w.verified && w.canReceive.USDC?.canReceive);
  const walletDone = ready.length > 0;
  const rate = merchant.pricing.fixedRate;
  const firstDone = (requests?.data.length ?? 0) > 0;

  const tasks = [
    {
      done: walletDone,
      title: "Connect your wallet",
      note: walletDone ? "Done · verified and takes USDC" : "Where your USDC lands · one signature, no money moves",
      action: () => setDialog("wallet"),
    },
    {
      done: rate !== null,
      title: "Set your rate",
      note: rate ? `R${formatRate(rate)} = 1 USDC · change it any time` : "Optional · e.g. R18.50 = 1 USDC, or type the USDC each time",
      action: () => setDialog("rate"),
    },
  ];

  return (
    <>
      <PageHeader title="Get started" kicker={`Welcome, ${merchant.businessName}`} />
      <div className="content" style={{ maxWidth: 640 }}>
        <h2 className="display" style={{ fontSize: "clamp(32px, 5vw, 44px)" }}>
          Two things, then you&apos;re live.
        </h2>
        {tasks.map((t) => (
          <button
            key={t.title}
            type="button"
            onClick={t.action}
            className="card row"
            style={{ cursor: "pointer", textAlign: "left", gap: 14, borderColor: t.done ? "var(--paid-line)" : "var(--line)", background: t.done ? "#f3fbf6" : "#fff", width: "100%" }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: t.done ? "var(--paid)" : "var(--ink)",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={t.done ? "check" : "arrowRight"} size={16} stroke={3} />
            </span>
            <span className="stack" style={{ gap: 2, flex: 1 }}>
              <strong style={{ fontSize: 16 }}>{t.title}</strong>
              <span className="hint">{t.note}</span>
            </span>
          </button>
        ))}
        <Link href={walletDone ? (firstDone ? "/overview" : "/requests/new") : "#"} aria-disabled={!walletDone} onClick={(e) => !walletDone && e.preventDefault()} className={`btn btn-lg btn-block ${walletDone ? "btn-primary" : "btn-dark"}`}>
          {walletDone ? (firstDone ? "Open dashboard" : "Create your first request") : "Connect a wallet to continue"}
        </Link>
        <Link href="/overview" className="btn btn-ghost btn-block">
          Skip for now
        </Link>
      </div>
      {dialog === "wallet" && (
        <ConnectWalletDialog
          existing={wallets?.data ?? []}
          onClose={() => setDialog(null)}
          onDone={(w) => {
            // The first verified wallet becomes the default for new requests.
            if (w.verified && !merchant.defaultWalletId) void api.post("/auth/settings", { defaultWalletId: w.id }).then(() => mutate());
            else void mutate();
          }}
        />
      )}
      {dialog === "rate" && <RateDialog onClose={() => setDialog(null)} />}
    </>
  );
}
