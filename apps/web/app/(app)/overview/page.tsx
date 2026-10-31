"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { OutcomePill, StatusPill } from "@/components/StatusPill";
import { errorMessage, qs } from "@/lib/api";
import { formatAmount, formatZar, fromStroops, timeAgo, toStroops } from "@/lib/format";
import { useLive, useNow, usePollWhenOffline } from "@/lib/live";
import { useHideAmounts, useMe, useWallets } from "@/lib/session";
import { requestTitle } from "@/lib/status";
import type { ChainPayment, Page, PaymentRequest, Summary } from "@/lib/types";

type Range = "7 days" | "30 days";

function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Counts up from 0 once, in whole stroops (no floats), unless reduced motion is on. */
function useCountUp(target: string | null): string | null {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (target === null) return;
    const end = toStroops(target);
    if (end === 0n || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - (1 - t) ** 3;
      const permille = BigInt(Math.round(eased * 1000));
      setShown(fromStroops((end * permille) / 1000n));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

export default function OverviewPage() {
  const { merchant } = useMe();
  const { hidden, toggle } = useHideAmounts();
  const { recent } = useLive();
  const refreshInterval = usePollWhenOffline();
  const from = useMemo(startOfMonth, []);
  const { data: summary, error } = useSWR<Summary>(`/v1/summary${qs({ from })}`, { refreshInterval });
  const { data: requests } = useSWR<Page<PaymentRequest>>("/v1/payment-requests?limit=5", { refreshInterval });
  const { data: payments } = useSWR<Page<ChainPayment>>("/v1/payments?limit=6", { refreshInterval });
  const { data: wallets } = useWallets();
  const total = useCountUp(summary ? summary.collected.usdc : null);

  const activity = useMemo(() => {
    const seen = new Set<string>();
    return [...recent, ...(payments?.data ?? [])].filter((p) => (seen.has(p.eventId) ? false : (seen.add(p.eventId), true))).slice(0, 6);
  }, [recent, payments]);

  const noWallet = wallets && !wallets.data.some((w) => w.verified);
  const attention = summary ? summary.needsYou.unmatched + summary.needsYou.refunds : null;

  return (
    <>
      <PageHeader title="Overview" kicker={`${greeting()}, ${merchant?.businessName ?? ""}`} />
      <div className="content">
        {noWallet && (
          <Link href="/get-started" className="alert alert-warn" style={{ textDecoration: "none" }}>
            <Icon name="wallet" size={18} />
            <span>
              <strong>Connect a wallet to start.</strong> Payments go straight to it. Finish setup →
            </span>
          </Link>
        )}
        {error && <div className="alert">{errorMessage(error)}</div>}

        <div className="row wrap" style={{ gap: 16, alignItems: "stretch" }}>
          <div className="card-dark enter stack" style={{ flex: "2 1 380px", minWidth: 0, gap: 18 }}>
            <div className="between">
              <span className="row" style={{ gap: 8 }}>
                <span style={{ fontSize: 14, color: "var(--on-dark-2)" }}>Received this month</span>
                <button
                  type="button"
                  onClick={toggle}
                  aria-pressed={hidden}
                  aria-label={hidden ? "Show amounts" : "Hide amounts"}
                  title={hidden ? "Show amounts" : "Hide amounts"}
                  className="icon-btn"
                  style={{ width: 34, height: 34, background: "var(--ink-2)", color: hidden ? "var(--sun)" : "var(--on-dark-2)" }}
                >
                  <Icon name={hidden ? "eyeOff" : "eye"} size={18} />
                </button>
              </span>
              {summary && (
                <span className="pill" style={{ background: "#1e3a2b", color: "var(--paid-on-dark)" }}>
                  {summary.collected.payments} payment{summary.collected.payments === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <span className="big-figure" aria-live="polite">
              {summary ? (
                <span key={hidden ? "h" : "s"} style={{ display: "inline-block", animation: "swap 280ms var(--ease) both", letterSpacing: hidden ? "0.04em" : undefined }}>
                  {hidden ? "••••••" : formatAmount(total ?? summary.collected.usdc)}
                </span>
              ) : (
                <span className="skeleton" style={{ display: "inline-block", width: 200, height: 40, background: "var(--ink-2)" }} />
              )}{" "}
              <span style={{ fontSize: 18, color: "var(--paid-on-dark)", letterSpacing: "-0.02em" }}>USDC</span>
            </span>
            <div className="row wrap">
              <Link href="/requests/new" className="btn btn-primary btn-sm" style={{ height: 42 }}>
                New request
              </Link>
              <Link href="/payments" className="btn btn-sm" style={{ height: 42, background: "var(--ink-2)", color: "#fff" }}>
                View payments
              </Link>
            </div>
          </div>
          <div style={{ flex: "1 1 260px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="kpi">
              <span className="kpi-label">Asked for</span>
              <span className="kpi-value">{summary ? (hidden ? "R •••••" : formatZar(summary.requestedZar)) : "—"}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Paid requests</span>
              <span className="kpi-value">{summary ? `${summary.requests.settled} / ${summary.requests.created}` : "—"}</span>
            </div>
            <Link href="/requests" className="kpi">
              <span className="kpi-label">Open now</span>
              <span className="kpi-value">{summary?.open.count ?? "—"}</span>
            </Link>
            <Link
              href={summary && summary.needsYou.unmatched > 0 ? "/payments" : "/requests"}
              className="kpi"
              style={attention ? { background: "var(--sun-soft)", borderColor: "var(--sun-line)" } : undefined}
            >
              <span className="kpi-label" style={attention ? { color: "var(--text)", fontWeight: 700 } : undefined}>
                Needs attention
              </span>
              <span className="kpi-value">{attention ?? "—"} →</span>
            </Link>
          </div>
        </div>

        <div className="row wrap" style={{ gap: 16, alignItems: "stretch" }}>
          <Chart hidden={hidden} />
          <div className="card stack" style={{ flex: "2 1 300px", minWidth: 0, gap: 4 }}>
            <div className="between">
              <h2 className="card-title">Live activity</h2>
              <Link href="/payments" className="hint" style={{ fontWeight: 700 }}>
                All payments
              </Link>
            </div>
            {payments && activity.length === 0 && <EmptyState title="Nothing yet">Payments show up here seconds after they land.</EmptyState>}
            {activity.map((p) => (
              <Link key={p.eventId} href={p.requestId ? `/requests/${p.requestId}` : "/payments"} className="list-row">
                <span className={`row-icon tone-${p.outcome === "COUNTED" ? "good" : "warn"}`}>
                  <Icon name={p.outcome === "COUNTED" ? "check" : "alert"} size={17} stroke={2.6} />
                </span>
                <span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>
                    {p.outcome === "COUNTED" ? "+" : ""}
                    {formatAmount(p.amount)} {p.asset.code}
                  </strong>
                  <span className="hint" style={{ fontSize: 12 }}>
                    {timeAgo(p.ledgerClosedAt)}
                  </span>
                </span>
                <OutcomePill outcome={p.outcome} />
              </Link>
            ))}
          </div>
        </div>

        <div className="card stack" style={{ gap: 4 }}>
          <div className="between">
            <h2 className="card-title">Recent requests</h2>
            <Link href="/requests" className="hint" style={{ fontWeight: 700 }}>
              See all
            </Link>
          </div>
          {requests && requests.data.length === 0 && (
            <EmptyState
              title="No requests yet"
              action={
                <Link href="/requests/new" className="btn btn-primary">
                  Create your first request
                </Link>
              }
            >
              Type a price in rand and send the link.
            </EmptyState>
          )}
          {(requests?.data ?? []).map((r) => (
            <Link key={r.id} href={`/requests/${r.id}`} className="list-row">
              <span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{requestTitle(r)}</strong>
                <span className="hint mono" style={{ fontSize: 12 }}>
                  {r.reference}
                </span>
              </span>
              <span className="stack hide-sm" style={{ gap: 0, alignItems: "flex-end" }}>
                <strong style={{ fontSize: 14 }}>{formatZar(r.zarAmount)}</strong>
                <span className="hint" style={{ fontSize: 12 }}>
                  {formatAmount(r.usdcAmount)} USDC
                </span>
              </span>
              <StatusPill status={r.status} />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

const DAY = 86_400_000;

function Chart({ hidden }: { hidden: boolean }) {
  const [range, setRange] = useState<Range>("7 days");
  const now = useNow(60_000);
  const days = range === "7 days" ? 7 : 30;
  const fromIso = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return new Date(d.getTime() - (days - 1) * DAY).toISOString();
  }, [now, days]);
  const refreshInterval = usePollWhenOffline();
  const { data } = useSWR<Page<ChainPayment>>(`/v1/payments${qs({ outcome: "COUNTED", from: fromIso, limit: 100 })}`, { refreshInterval });

  const bars = useMemo(() => {
    const start = new Date(fromIso).getTime();
    const buckets = range === "7 days" ? 7 : 5;
    const span = range === "7 days" ? DAY : 6 * DAY;
    const sums = Array.from({ length: buckets }, () => 0n);
    for (const p of data?.data ?? []) {
      const i = Math.min(buckets - 1, Math.floor((new Date(p.ledgerClosedAt).getTime() - start) / span));
      if (i >= 0) sums[i] = (sums[i] ?? 0n) + toStroops(p.amount);
    }
    const max = sums.reduce((a, b) => (b > a ? b : a), 0n);
    return sums.map((sum, i) => {
      const at = new Date(start + i * span);
      return {
        label: range === "7 days" ? at.toLocaleDateString("en-ZA", { weekday: "short" }) : `W${i + 1}`,
        value: formatAmount(fromStroops(sum)),
        pct: max > 0n ? Math.max(4, Number.parseInt(((sum * 100n) / max).toString(), 10)) : 4,
        top: sum > 0n && sum === max,
        zero: sum === 0n,
      };
    });
  }, [data, fromIso, range]);

  const top = bars.find((b) => b.top);

  return (
    <div className="card stack" style={{ flex: "3 1 440px", minWidth: 0 }}>
      <div className="between">
        <h2 className="card-title">USDC received</h2>
        <div className="seg" role="group" aria-label="Range" style={{ padding: 3 }}>
          {(["7 days", "30 days"] as Range[]).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} style={{ height: 30, fontSize: 12 }}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div role="img" aria-label={hidden ? `USDC received, last ${range}. Amounts hidden.` : `USDC received, last ${range}.${top ? ` Highest: ${top.label} at ${top.value}.` : " Nothing yet."}`} style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 190 }}>
        {bars.map((b, i) => (
          <div key={`${b.label}-${i}`} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
              {hidden ? "•••" : b.value}
            </span>
            <div style={{ width: "100%", maxWidth: 44, height: `${b.pct * 0.8}%`, borderRadius: 8, background: b.top ? "var(--protea)" : b.zero ? "var(--row)" : "var(--ink)", transition: "height 600ms var(--ease)" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
