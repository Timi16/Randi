"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { PageHeader } from "@/components/AppShell";
import { Dialog } from "@/components/Dialog";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { OutcomePill } from "@/components/StatusPill";
import { useToast } from "@/components/Toast";
import { api, errorMessage, qs } from "@/lib/api";
import { explorerAccount, explorerTx } from "@/lib/config";
import { formatAmount, formatDateTime, formatZar, shortAddress, shortHash } from "@/lib/format";
import { usePollWhenOffline } from "@/lib/live";
import { isOpen, isUnmatched, owesRefund, PAYMENT_OUTCOME, REJECTED_OUTCOMES, requestTitle } from "@/lib/status";
import type { ChainPayment, Page, PaymentRequest } from "@/lib/types";

type Tab = "all" | "unmatched" | "rejected" | "refund";

const TABS: { key: Tab; label: string; test: (p: ChainPayment) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "unmatched", label: "Unmatched", test: isUnmatched },
  { key: "rejected", label: "Rejected", test: (p) => REJECTED_OUTCOMES.includes(p.outcome) },
  { key: "refund", label: "Send back", test: owesRefund },
];

export default function PaymentsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [linking, setLinking] = useState<ChainPayment | null>(null);
  const [refunding, setRefunding] = useState<ChainPayment | null>(null);
  const refreshInterval = usePollWhenOffline();
  const { data, error, isLoading } = useSWR<Page<ChainPayment>>("/v1/payments?limit=100", { refreshInterval });
  const all = useMemo(() => data?.data ?? [], [data]);
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const rows = current ? all.filter(current.test) : all;

  return (
    <>
      <PageHeader title="Payments" kicker="Everything Randi saw on Stellar" />
      <div className="content">
        <div className="chips" role="group" aria-label="Filter payments">
          {TABS.map((t) => {
            const n = all.filter(t.test).length;
            return (
              <button
                key={t.key}
                type="button"
                className="chip-btn"
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
                style={t.key !== "all" && tab !== t.key && n > 0 ? { background: "var(--sun-soft)", borderColor: "var(--sun-line)" } : undefined}
              >
                {t.label}
                {data && <span className="count">{n}</span>}
              </button>
            );
          })}
        </div>
        {tab === "unmatched" && (
          <div className="alert alert-info">Payments with no reference, or one Randi doesn&apos;t know. If you know which request it was for, link it. Randi still checks the amount and time.</div>
        )}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {error && <div className="alert" style={{ margin: 16 }}>{errorMessage(error)}</div>}
          {isLoading && (
            <div className="stack" style={{ padding: 16 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 52 }} />
              ))}
            </div>
          )}
          {data && rows.length === 0 && (
            <EmptyState title={tab === "all" ? "No payments yet" : "Nothing here"}>
              {tab === "all" ? "Payments to your wallets show up here within seconds of landing on Stellar." : "All clear."}
            </EmptyState>
          )}
          {rows.length > 0 && (
            <>
              <table className="table only-wide">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th className="num">Amount</th>
                    <th>From</th>
                    <th>Reference sent</th>
                    <th>Outcome</th>
                    <th>Request</th>
                    <th>Tx hash</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.eventId}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {formatDateTime(p.ledgerClosedAt)}
                      </td>
                      <td className="num" style={{ fontWeight: 800 }}>
                        {formatAmount(p.amount)} <span className="muted" style={{ fontWeight: 600 }}>{p.asset.code}</span>
                      </td>
                      <td>
                        <a className="mono" href={explorerAccount(p.from)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                          {shortAddress(p.from)}
                        </a>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {p.memo ?? <span className="muted">none</span>}
                      </td>
                      <td>
                        <OutcomePill outcome={p.outcome} />
                      </td>
                      <td>
                        {p.requestId ? (
                          <Link href={`/requests/${p.requestId}`} style={{ fontWeight: 700 }}>
                            View
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <a className="mono" href={explorerTx(p.txHash)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                          {shortHash(p.txHash)}
                        </a>
                      </td>
                      <td className="num">
                        <RowAction p={p} onLink={() => setLinking(p)} onRefund={() => setRefunding(p)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="only-narrow" style={{ padding: "0 14px" }}>
                {rows.map((p) => (
                  <div key={p.eventId} className="list-row" style={{ alignItems: "flex-start" }}>
                    <span className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                      <strong>
                        {formatAmount(p.amount)} {p.asset.code}
                      </strong>
                      <span className="hint" style={{ fontSize: 12 }}>
                        {formatDateTime(p.ledgerClosedAt)} · <span className="mono">{p.memo ?? "no memo"}</span>
                      </span>
                      <a className="mono" href={explorerTx(p.txHash)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                        tx {shortHash(p.txHash)}
                      </a>
                      <span className="hint" style={{ fontSize: 12 }}>
                        {PAYMENT_OUTCOME[p.outcome].explain}
                      </span>
                    </span>
                    <span className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
                      <OutcomePill outcome={p.outcome} />
                      <RowAction p={p} onLink={() => setLinking(p)} onRefund={() => setRefunding(p)} />
                      {p.requestId && (
                        <Link href={`/requests/${p.requestId}`} className="hint" style={{ fontWeight: 700 }}>
                          Request →
                        </Link>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {linking && <LinkDialog payment={linking} onClose={() => setLinking(null)} />}
      {refunding && <RefundDialog payment={refunding} onClose={() => setRefunding(null)} />}
    </>
  );
}

function RowAction({ p, onLink, onRefund }: { p: ChainPayment; onLink: () => void; onRefund: () => void }) {
  if (isUnmatched(p) && p.asset.code === "USDC") {
    return (
      <button type="button" className="btn btn-dark btn-sm" onClick={onLink}>
        <Icon name="link" size={14} /> Link
      </button>
    );
  }
  if (owesRefund(p)) {
    return (
      <button type="button" className="btn btn-outline btn-sm" onClick={onRefund}>
        Mark sent back
      </button>
    );
  }
  if (p.refundedAt) return <span className="hint">Sent back</span>;
  return null;
}

function LinkDialog({ payment, onClose }: { payment: ChainPayment; onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const { data, isLoading } = useSWR<Page<PaymentRequest>>(`/v1/payment-requests${qs({ walletId: payment.walletId ?? undefined, limit: 100 })}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const candidates = (data?.data ?? [])
    .filter((r) => isOpen(r.status))
    .sort((a, b) => {
      const score = (r: PaymentRequest) => (r.id === payment.suggestedRequestId ? 2 : r.usdcRemaining === payment.amount ? 1 : 0);
      return score(b) - score(a);
    });

  const link = async (r: PaymentRequest) => {
    setBusy(r.id);
    setError(null);
    try {
      await api.post(`/v1/payments/${encodeURIComponent(payment.eventId)}/link`, { requestId: r.id });
      await Promise.all([mutate((k) => typeof k === "string" && (k.startsWith("/v1/payments") || k.startsWith("/v1/payment-requests") || k.startsWith("/v1/summary")))]);
      toast(`Linked to ${requestTitle(r)}`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  return (
    <Dialog title={`Link ${formatAmount(payment.amount)} USDC`} onClose={onClose} subtitle="Only payments that reached this wallet in USDC can be linked. Randi still checks the time and amount.">
      {error && <div className="alert">{error}</div>}
      {isLoading && <div className="skeleton" style={{ height: 120 }} />}
      {data && candidates.length === 0 && <EmptyState title="No open requests on this wallet">Create a request first, or send this payment back.</EmptyState>}
      <div className="stack" style={{ gap: 8 }}>
        {candidates.map((r) => {
          const best = r.id === payment.suggestedRequestId || r.usdcRemaining === payment.amount;
          return (
            <button key={r.id} type="button" className="btn btn-outline btn-block" style={{ height: "auto", padding: "12px 14px", justifyContent: "space-between", borderRadius: 14 }} onClick={() => void link(r)} disabled={busy !== null}>
              <span className="stack" style={{ gap: 2, alignItems: "flex-start", textAlign: "left" }}>
                <span>
                  {requestTitle(r)} {best && <span className="pill tone-good" style={{ height: 20 }}>Best match</span>}
                </span>
                <span className="hint" style={{ fontWeight: 500 }}>
                  {formatZar(r.zarAmount)} · {formatAmount(r.usdcRemaining)} USDC due · <span className="mono">{r.reference}</span>
                </span>
              </span>
              {busy === r.id ? <span className="spinner" /> : <Icon name="arrowRight" size={16} />}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}

function RefundDialog({ payment, onClose }: { payment: ChainPayment; onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/v1/payments/${encodeURIComponent(payment.eventId)}/refunded`, hash.trim() ? { txHash: hash.trim() } : {});
      await mutate((k) => typeof k === "string" && (k.startsWith("/v1/payments") || k.startsWith("/v1/payment-requests")));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={`Sent back ${formatAmount(payment.amount)} ${payment.asset.code}?`}
      onClose={onClose}
      subtitle={
        <>
          Send it from your wallet to <span className="mono">{shortAddress(payment.from)}</span>, then record it here. Randi never moves money.
        </>
      }
    >
      <label className="field">
        <span className="label">Refund transaction hash (optional)</span>
        <input className="input mono" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="64 hex characters" spellCheck={false} />
      </label>
      {error && <div className="alert">{error}</div>}
      <button type="button" className="btn btn-dark btn-lg btn-block" onClick={save} disabled={busy}>
        {busy && <span className="spinner" />} Mark as sent back
      </button>
    </Dialog>
  );
}
