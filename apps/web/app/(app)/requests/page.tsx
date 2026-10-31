"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { StatusPill } from "@/components/StatusPill";
import { errorMessage, qs } from "@/lib/api";
import { explorerTx } from "@/lib/config";
import { formatAmount, formatDateTime, formatTime, formatZar, shortHash, timeLeft } from "@/lib/format";
import { useNow, usePollWhenOffline } from "@/lib/live";
import { attentionReason, isOpen, requestSubtitle, requestTitle } from "@/lib/status";
import type { Page, PaymentRequest, RequestStats, RequestStatus } from "@/lib/types";

type Filter = "ALL" | RequestStatus | "ATTENTION";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "PARTIALLY_PAID", label: "Part-paid" },
  { key: "PAID", label: "Paid" },
  { key: "OVERPAID", label: "Paid · extra" },
  { key: "EXPIRED", label: "Expired" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "FAILED", label: "Failed" },
  { key: "ATTENTION", label: "Needs attention" },
];

export default function RequestsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const q = useDeferredValue(search.trim());
  const now = useNow();
  const refreshInterval = usePollWhenOffline();

  const listKey = `/v1/payment-requests${qs({
    status: filter !== "ALL" && filter !== "ATTENTION" ? filter : undefined,
    needsAttention: filter === "ATTENTION" ? "true" : undefined,
    q: q || undefined,
    limit,
  })}`;
  const { data, error, isLoading } = useSWR<Page<PaymentRequest>>(listKey, { refreshInterval, keepPreviousData: true });
  const { data: stats } = useSWR<RequestStats>(`/v1/payment-requests/stats${qs({ q: q || undefined })}`, { refreshInterval });
  const { data: attention } = useSWR<Page<PaymentRequest>>("/v1/payment-requests?needsAttention=true&limit=100", { refreshInterval });

  const count = (key: Filter): number | null => {
    if (key === "ALL") return stats?.total ?? null;
    if (key === "ATTENTION") return attention?.data.length ?? null;
    return stats?.byStatus[key] ?? null;
  };
  const visible = FILTERS.filter((f) => ["ALL", "PENDING", "PAID", "ATTENTION"].includes(f.key) || (count(f.key) ?? 0) > 0 || filter === f.key);
  const rows = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Requests"
        kicker={stats ? `${stats.total} in total` : "Payment requests"}
        actions={
          <Link href="/requests/new" className="btn btn-primary btn-sm hide-sm">
            <Icon name="plus" size={15} stroke={3} /> New request
          </Link>
        }
      />
      <div className="content">
        <div className="between wrap">
          <div className="chips" role="group" aria-label="Filter by status">
            {visible.map((f) => (
              <button
                key={f.key}
                type="button"
                className="chip-btn"
                aria-pressed={filter === f.key}
                onClick={() => {
                  setFilter(f.key);
                  setLimit(25);
                }}
                style={f.key === "ATTENTION" && filter !== f.key && (count(f.key) ?? 0) > 0 ? { background: "var(--sun-soft)", borderColor: "var(--sun-line)" } : undefined}
              >
                {f.label}
                {count(f.key) !== null && <span className="count">{count(f.key)}</span>}
              </button>
            ))}
          </div>
          <label className="row" style={{ height: 40, minWidth: 0, flex: "0 1 300px", padding: "0 14px", borderRadius: 12, background: "#fff", border: "1px solid var(--line)" }}>
            <Icon name="search" size={16} style={{ color: "var(--muted)" }} />
            <input
              aria-label="Search by reference, request ID or order number"
              placeholder="Reference, request ID or order #"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ border: 0, outline: "none", background: "transparent", flex: 1, minWidth: 0, fontSize: 14 }}
            />
          </label>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {error && <div className="alert" style={{ margin: 16 }}>{errorMessage(error)}</div>}
          {isLoading && !data && (
            <div className="stack" style={{ padding: 16 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 48 }} />
              ))}
            </div>
          )}
          {data && rows.length === 0 && (
            <EmptyState
              title={q || filter !== "ALL" ? "Nothing matches" : "No requests yet"}
              action={
                q || filter !== "ALL" ? undefined : (
                  <Link href="/requests/new" className="btn btn-primary">
                    Create your first request
                  </Link>
                )
              }
            >
              {q || filter !== "ALL" ? "Try another filter or search." : "Type a price in rand, send the link, and watch it get paid."}
            </EmptyState>
          )}
          {rows.length > 0 && (
            <>
              <table className="table only-wide">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Description</th>
                    <th className="num">ZAR</th>
                    <th className="num">USDC</th>
                    <th>Reference</th>
                    <th>Status</th>
                    <th>Expires / paid</th>
                    <th>Tx hash</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => router.push(`/requests/${r.id}`)} style={{ cursor: "pointer" }}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td>
                        <Link href={`/requests/${r.id}`} style={{ fontWeight: 700, textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                          {requestTitle(r)}
                        </Link>
                        <div className="hint" style={{ fontSize: 12 }}>
                          {attentionReason(r) ?? requestSubtitle(r)}
                        </div>
                      </td>
                      <td className="num" style={{ fontWeight: 700 }}>
                        {formatZar(r.zarAmount)}
                      </td>
                      <td className="num">{formatAmount(r.usdcAmount)}</td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {r.reference}
                      </td>
                      <td>
                        <StatusPill status={r.status} />
                      </td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {r.paidAt ? `Paid ${formatTime(r.paidAt)}` : isOpen(r.status) ? timeLeft(r.expiresAt, now) || "now" : formatDateTime(r.expiresAt)}
                      </td>
                      <td>
                        {r.paidTxHash ? (
                          <a className="mono" href={explorerTx(r.paidTxHash)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }} onClick={(e) => e.stopPropagation()}>
                            {shortHash(r.paidTxHash)}
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="only-narrow" style={{ padding: "0 14px" }}>
                {rows.map((r) => (
                  <Link key={r.id} href={`/requests/${r.id}`} className="list-row" style={{ alignItems: "flex-start" }}>
                    <span className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                      <strong style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{requestTitle(r)}</strong>
                      <span className="hint" style={{ fontSize: 12 }}>
                        {formatAmount(r.usdcAmount)} USDC · <span className="mono">{r.reference}</span>
                      </span>
                      {attentionReason(r) && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--sun-fg)" }}>{attentionReason(r)}</span>}
                      {r.paidTxHash && (
                        <span className="mono" style={{ fontSize: 12, color: "var(--paid-fg)" }}>
                          tx {shortHash(r.paidTxHash)}
                        </span>
                      )}
                    </span>
                    <span className="stack" style={{ gap: 6, alignItems: "flex-end" }}>
                      <strong>{formatZar(r.zarAmount)}</strong>
                      <StatusPill status={r.status} />
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
        {data?.nextCursor && limit < 100 && (
          <button type="button" className="btn btn-outline" style={{ alignSelf: "center" }} onClick={() => setLimit((l) => Math.min(100, l + 25))}>
            Show more
          </button>
        )}
      </div>
    </>
  );
}
