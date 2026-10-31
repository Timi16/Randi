"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/AppShell";
import { CopyButton } from "@/components/CopyButton";
import { Dialog } from "@/components/Dialog";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { QrCode } from "@/components/QrCode";
import { OutcomePill, StatusPill } from "@/components/StatusPill";
import { useToast } from "@/components/Toast";
import { api, ApiError, errorMessage } from "@/lib/api";
import { explorerAccount, explorerTx } from "@/lib/config";
import { countdown, formatAmount, formatDateTime, formatRate, formatZar, isPositive, shortAddress, shortHash } from "@/lib/format";
import { useNow, usePollWhenOffline } from "@/lib/live";
import { useMe } from "@/lib/session";
import { isOpen, isSettled, PAYMENT_OUTCOME, REQUEST_STATUS, requestTitle } from "@/lib/status";
import type { PaymentRequest, RequestDetail } from "@/lib/types";

export default function RequestDetailPage() {
  return (
    <Suspense>
      <Detail />
    </Suspense>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const refreshInterval = usePollWhenOffline();
  const { data, error, mutate } = useSWR<RequestDetail>(`/v1/payment-requests/${encodeURIComponent(id)}`, { refreshInterval });
  const [dialog, setDialog] = useState<"cancel" | "refund" | null>(null);

  if (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <>
        <PageHeader title={missing ? "Not found" : "Request"} kicker={<Link href="/requests">Requests</Link>} />
        <div className="content">
          <div className="card">
            <EmptyState
              title={missing ? "We can't find this request" : "We can't load this request"}
              action={
                <Link href="/requests" className="btn btn-dark">
                  Back to requests
                </Link>
              }
            >
              {missing ? "It may belong to another account, or the link is wrong." : errorMessage(error)}
            </EmptyState>
          </div>
        </div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Request" kicker={<Link href="/requests">Requests</Link>} />
        <div className="content">
          <div className="skeleton" style={{ height: 140 }} />
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      </>
    );
  }

  const r = data.request;
  return (
    <>
      <PageHeader title={requestTitle(r)} kicker={<Link href="/requests">Requests</Link>} actions={<span className="hide-sm"><StatusPill status={r.status} /></span>} />
      <div className="content" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", alignItems: "start" }}>
        <div className="stack">
          <Summary r={r} />
          {isSettled(r.status) && r.paidTxHash && <Proof r={r} />}
          {isOpen(r.status) && <SharePanel r={r} defaultOpen={params.get("share") === "1" || r.status === "PENDING"} />}
          <Details r={r} />
        </div>
        <div className="stack">
          <Timeline data={data} />
          <Actions r={r} onCancel={() => setDialog("cancel")} onRefund={() => setDialog("refund")} />
        </div>
      </div>
      {dialog === "cancel" && <CancelDialog r={r} onClose={() => setDialog(null)} onDone={() => void mutate()} />}
      {dialog === "refund" && <RefundDialog r={r} onClose={() => setDialog(null)} onDone={() => void mutate()} />}
    </>
  );
}

function Summary({ r }: { r: PaymentRequest }) {
  const now = useNow(1000);
  const partial = r.status === "PARTIALLY_PAID";
  return (
    <div className="card stack">
      <div className="between wrap">
        <StatusPill status={r.status} />
        <span className="hint">
          Request <span className="mono">{r.publicId}</span> · created {formatDateTime(r.createdAt)}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="kpi" style={{ background: "var(--page)", border: 0 }}>
          <span className="kpi-label">You asked</span>
          <span className="kpi-value" style={{ fontSize: 26 }}>
            {formatZar(r.zarAmount)}
          </span>
        </div>
        <div className="kpi" style={{ background: "var(--ink)", color: "#fff", border: 0 }}>
          <span className="kpi-label" style={{ color: "var(--on-dark-2)" }}>
            They send
          </span>
          <span className="kpi-value" style={{ fontSize: 26 }}>
            {formatAmount(r.usdcAmount)} <span style={{ fontSize: 13, color: "var(--sun)" }}>USDC</span>
          </span>
        </div>
      </div>
      <span className="hint">
        {r.pricing.mode === "FIXED_RATE" && r.pricing.rate
          ? `Your rate: R${formatRate(r.pricing.rate)} = 1 USDC, rounded up to the cent.`
          : `Typed by you${r.pricing.impliedRate ? ` (R${formatRate(r.pricing.impliedRate)} per USDC)` : ""}.`}{" "}
        Only the USDC is checked.
      </span>
      {(partial || isPositive(r.usdcReceived)) && (
        <div className={`alert ${partial ? "alert-warn" : "alert-good"}`}>
          {formatAmount(r.usdcReceived)} of {formatAmount(r.usdcAmount)} USDC received{partial ? ` · ${formatAmount(r.usdcRemaining)} still due` : ""}.
        </div>
      )}
      {isOpen(r.status) && (
        <span className="row" style={{ fontWeight: 700, fontSize: 14 }}>
          <Icon name="clock" size={16} /> Expires in <span className="mono">{countdown(r.expiresAt, now)}</span>
        </span>
      )}
    </div>
  );
}

function Proof({ r }: { r: PaymentRequest }) {
  return (
    <div className="card stack" style={{ background: "var(--paid)", color: "#fff", border: 0 }}>
      <div className="row" style={{ fontWeight: 800, fontSize: 18 }}>
        <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="check" size={18} stroke={3.2} />
        </span>
        Paid{r.paidAt ? ` at ${formatDateTime(r.paidAt)}` : ""} · verified on Stellar Testnet
      </div>
      <span className="mono break" style={{ fontSize: 13, background: "rgba(14,11,16,0.18)", padding: "10px 12px", borderRadius: 12 }}>
        {r.paidTxHash}
      </span>
      <div className="row wrap">
        <CopyButton value={r.paidTxHash ?? ""} label="Copy hash" className="btn btn-sm" style={{ background: "#fff" }} />
        <a className="btn btn-sm" style={{ background: "var(--ink)", color: "#fff" }} href={explorerTx(r.paidTxHash ?? "")} target="_blank" rel="noreferrer">
          View on stellar.expert <Icon name="external" size={14} />
        </a>
      </div>
    </div>
  );
}

function SharePanel({ r, defaultOpen }: { r: PaymentRequest; defaultOpen: boolean }) {
  const { merchant } = useMe();
  const toast = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [qr, setQr] = useState(false);
  const business = merchant?.businessName ?? "We";
  const message = `${business} has sent you a payment request for ${formatZar(r.zarAmount)} (${formatAmount(r.usdcAmount)} USDC on Stellar Testnet): ${r.paymentUrl}`;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="card stack">
      <button type="button" className="between" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
        <h2 className="card-title">Share with your customer</h2>
        <Icon name={open ? "dash" : "plus"} size={18} />
      </button>
      {open && (
        <>
          <div className="row" style={{ background: "var(--page)", borderRadius: 12, padding: "10px 12px" }}>
            <span className="mono break" style={{ fontSize: 13, flex: 1 }}>
              {r.paymentUrl}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
            <CopyButton value={r.paymentUrl} label="Copy link" copiedLabel="Link copied" className="btn btn-primary" />
            <a className="btn btn-dark" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
              <Icon name="whatsapp" size={17} /> WhatsApp
            </a>
            <a className="btn btn-outline" href={`mailto:?subject=${encodeURIComponent(`Payment request from ${business}`)}&body=${encodeURIComponent(message)}`}>
              <Icon name="mail" size={17} /> Email
            </a>
            {canShare && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => navigator.share({ title: `Payment request from ${business}`, text: message, url: r.paymentUrl }).catch(() => undefined)}
              >
                <Icon name="share" size={17} /> Share…
              </button>
            )}
            <button type="button" className="btn btn-outline" onClick={() => setQr((q) => !q)} aria-expanded={qr}>
              <Icon name="qr" size={17} /> {qr ? "Hide QR" : "Show QR"}
            </button>
            <a className="btn btn-outline" href={r.paymentUrl} target="_blank" rel="noreferrer" onClick={() => toast("Opened the payment page")}>
              <Icon name="external" size={17} /> Open page
            </a>
          </div>
          {qr && (
            <div className="stack" style={{ alignItems: "center", padding: 12 }}>
              <QrCode value={r.paymentUrl} size={220} label="QR code of the payment page link" />
              <span className="hint">Show this on the counter. It opens the payment page.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Details({ r }: { r: PaymentRequest }) {
  const rows: { label: string; value: string; copy?: string; href?: string; mono?: boolean }[] = [
    { label: "Payment reference (memo)", value: r.reference, copy: r.reference, mono: true },
    { label: "Receiving wallet", value: shortAddress(r.wallet, 6, 6), copy: r.wallet, href: explorerAccount(r.wallet), mono: true },
    { label: "Asset", value: `USDC · issuer ${shortAddress(r.asset.issuer ?? "")}`, copy: r.asset.issuer ?? undefined },
    { label: "Network", value: r.network },
    { label: "Expires", value: formatDateTime(r.expiresAt) },
    { label: "Request ID", value: r.publicId, copy: r.publicId, mono: true },
  ];
  if (r.customerRef) rows.splice(4, 0, { label: "Order number", value: `#${r.customerRef}` });
  return (
    <div className="card stack" style={{ gap: 0 }}>
      <h2 className="card-title" style={{ marginBottom: 6 }}>
        Payment details
      </h2>
      {rows.map((row) => (
        <div key={row.label} className="list-row" style={{ justifyContent: "space-between" }}>
          <span className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="hint">{row.label}</span>
            {row.href ? (
              <a href={row.href} target="_blank" rel="noreferrer" className={row.mono ? "mono" : ""} style={{ fontWeight: 600, fontSize: 14 }}>
                {row.value}
              </a>
            ) : (
              <span className={row.mono ? "mono" : ""} style={{ fontWeight: 600, fontSize: 14 }}>
                {row.value}
              </span>
            )}
          </span>
          {row.copy && <CopyButton value={row.copy} ariaLabel={`Copy ${row.label.toLowerCase()}`} />}
        </div>
      ))}
    </div>
  );
}

interface TimelineItem {
  at: string;
  key: string;
  node: React.ReactNode;
  dot: string;
}

function Timeline({ data }: { data: RequestDetail }) {
  const { request: r, payments, events } = data;
  const items: TimelineItem[] = [
    { at: r.createdAt, key: "created", dot: "var(--ink)", node: <strong>Created · {formatZar(r.zarAmount)} / {formatAmount(r.usdcAmount)} USDC</strong> },
    ...payments.map((p) => ({
      at: p.ledgerClosedAt,
      key: `p-${p.eventId}`,
      dot: PAYMENT_OUTCOME[p.outcome].tone === "good" ? "var(--paid)" : "#E0A800",
      node: (
        <span className="stack" style={{ gap: 4 }}>
          <span className="row wrap" style={{ gap: 8 }}>
            <strong>
              {formatAmount(p.amount)} {p.asset.code} seen
            </strong>
            <OutcomePill outcome={p.outcome} />
          </span>
          <span className="hint">
            from <span className="mono">{shortAddress(p.from)}</span> ·{" "}
            <a className="mono" href={explorerTx(p.txHash)} target="_blank" rel="noreferrer">
              tx {shortHash(p.txHash)}
            </a>
            {p.linkedManually ? " · linked by you" : ""}
          </span>
          {p.outcome !== "COUNTED" && <span className="hint">{PAYMENT_OUTCOME[p.outcome].explain}</span>}
        </span>
      ),
    })),
    ...events
      .filter((e) => e.fromStatus !== e.toStatus)
      .map((e) => ({
        at: e.createdAt,
        key: `e-${e.id}`,
        dot: REQUEST_STATUS[e.toStatus].tone === "good" ? "var(--paid)" : "var(--muted-2)",
        node: (
          <span>
            <strong>{REQUEST_STATUS[e.toStatus].label}</strong>
            <span className="hint"> · {e.reason.replace(/_/g, " ").toLowerCase()}</span>
          </span>
        ),
      })),
  ];
  if (r.refundedAt) items.push({ at: r.refundedAt, key: "refunded", dot: "var(--ink)", node: <strong>You marked the refund as sent</strong> });
  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="card stack">
      <h2 className="card-title">Timeline</h2>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map((item) => (
          <li key={item.key} className="row" style={{ alignItems: "flex-start", gap: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: item.dot, marginTop: 6, flexShrink: 0 }} />
            <span className="stack" style={{ gap: 2, flex: 1, fontSize: 14 }}>
              {item.node}
              <span className="hint" style={{ fontSize: 12 }}>
                {formatDateTime(item.at)}
              </span>
            </span>
          </li>
        ))}
        {isOpen(r.status) && (
          <li className="row" style={{ gap: 12, color: "var(--sun-fg)", fontWeight: 700, fontSize: 14 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#E0A800", animation: "pulse 1.2s ease-in-out infinite" }} />
            Watching Stellar for the payment…
          </li>
        )}
      </ol>
    </div>
  );
}

function Actions({ r, onCancel, onRefund }: { r: PaymentRequest; onCancel: () => void; onRefund: () => void }) {
  const owed = r.refundOwed && !r.refundedAt;
  if (r.status !== "PENDING" && !owed) return null;
  return (
    <div className="card stack">
      {owed && (
        <>
          <div className="alert alert-warn">
            <span>
              Send back{" "}
              {r.refundDue
                .filter((d) => d.amountStroops !== "0")
                .map((d) => `${formatAmount(d.amount)} ${d.asset.code}`)
                .join(" and ")}{" "}
              from your wallet. Randi never moves money; record it here once it&apos;s sent.
            </span>
          </div>
          <button type="button" className="btn btn-dark" onClick={onRefund}>
            Mark refund as sent
          </button>
        </>
      )}
      {r.status === "PENDING" && (
        <button type="button" className="btn btn-outline" style={{ color: "var(--danger-fg)" }} onClick={onCancel}>
          <Icon name="cross" size={16} /> Cancel request
        </button>
      )}
    </div>
  );
}

function CancelDialog({ r, onClose, onDone }: { r: PaymentRequest; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/payment-requests/${r.id}/cancel`);
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Dialog title="Cancel this request?" onClose={onClose}>
      <span>The link stops taking payments. If your customer pays anyway, Randi records it and flags it for you to send back.</span>
      {error && <div className="alert">{error}</div>}
      <div className="row">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Keep it
        </button>
        <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={cancel} disabled={busy}>
          {busy && <span className="spinner" />} Cancel request
        </button>
      </div>
    </Dialog>
  );
}

function RefundDialog({ r, onClose, onDone }: { r: PaymentRequest; onClose: () => void; onDone: () => void }) {
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/payment-requests/${r.id}/refunded`, hash.trim() ? { txHash: hash.trim() } : {});
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Dialog title="Mark the refund as sent" onClose={onClose} subtitle="Randi doesn't send money. This only records that you did.">
      <label className="field">
        <span className="label">Refund transaction hash (optional)</span>
        <input className="input mono" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="64 hex characters" spellCheck={false} />
      </label>
      {error && <div className="alert">{error}</div>}
      <button type="button" className="btn btn-dark btn-lg btn-block" onClick={save} disabled={busy}>
        {busy && <span className="spinner" />} Mark as sent
      </button>
    </Dialog>
  );
}
