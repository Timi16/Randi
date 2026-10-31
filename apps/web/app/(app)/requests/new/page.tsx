"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { api, ApiError, errorMessage, idempotencyKey } from "@/lib/api";
import { EXPIRY_PRESETS } from "@/lib/expiry";
import { formatAmount, formatRate, formatZar, shortAddress } from "@/lib/format";
import { useMe, useWallets } from "@/lib/session";
import type { PaymentRequest, PricingMode, Quote } from "@/lib/types";
import { cannotReceiveText } from "../../wallets/_components/WalletChecks";

const ZAR_RE = /^\d{1,7}(\.\d{1,2})?$/;
const USDC_RE = /^\d{1,12}(\.\d{1,7})?$/;

type QuoteState = { status: "idle" } | { status: "loading" } | { status: "ok"; quote: Quote } | { status: "error"; message: string };

/** New request (docs/Frontend.md §5.4). The preview is the API's own quote, so it equals what gets saved. */
export default function NewRequestPage() {
  const router = useRouter();
  const { merchant } = useMe();
  const { data: walletData, isLoading: walletsLoading } = useWallets();
  const hasRate = Boolean(merchant?.pricing.fixedRate);

  const [zar, setZar] = useState("");
  const [mode, setMode] = useState<PricingMode>(merchant?.pricing.defaultMode === "FIXED_RATE" && hasRate ? "FIXED_RATE" : "MANUAL");
  const [usdc, setUsdc] = useState("");
  const [description, setDescription] = useState("");
  const [customerRef, setCustomerRef] = useState("");
  const [walletId, setWalletId] = useState<string>("");
  const [expiry, setExpiry] = useState<number>(merchant?.defaultExpiryMinutes ?? 30);
  const [customExpiry, setCustomExpiry] = useState(false);
  const [quote, setQuote] = useState<QuoteState>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(idempotencyKey());

  const wallets = useMemo(() => (walletData?.data ?? []).filter((w) => w.verified), [walletData]);
  const usable = wallets.filter((w) => !cannotReceiveText(w));

  // Pick the default wallet once the list arrives.
  useEffect(() => {
    if (walletId || !usable.length) return;
    const preferred = usable.find((w) => w.id === merchant?.defaultWalletId) ?? usable[0];
    if (preferred) setWalletId(preferred.id);
  }, [usable, walletId, merchant?.defaultWalletId]);

  // Any change to what would be sent is a new request: a new Idempotency-Key.
  useEffect(() => {
    keyRef.current = idempotencyKey();
  }, [zar, mode, usdc, description, customerRef, walletId, expiry]);

  // Live quote from the API, debounced.
  useEffect(() => {
    const zarOk = ZAR_RE.test(zar) && /[1-9]/.test(zar);
    const usdcOk = USDC_RE.test(usdc) && /[1-9]/.test(usdc);
    if (!zarOk || (mode === "MANUAL" && !usdcOk)) {
      setQuote({ status: "idle" });
      return;
    }
    setQuote({ status: "loading" });
    const aborter = new AbortController();
    const timer = setTimeout(() => {
      api
        .post<Quote>("/v1/pricing/quote", { zarAmount: zar, pricingMode: mode, ...(mode === "MANUAL" ? { usdcAmount: usdc } : {}) }, { signal: aborter.signal })
        .then((q) => setQuote({ status: "ok", quote: q }))
        .catch((err: unknown) => {
          if ((err as { name?: string }).name === "AbortError") return;
          setQuote({ status: "error", message: errorMessage(err) });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      aborter.abort();
    };
  }, [zar, usdc, mode]);

  const canCreate = quote.status === "ok" && walletId !== "" && !busy;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ request: PaymentRequest; paymentUrl: string }>(
        "/v1/payment-requests",
        {
          walletId,
          zarAmount: zar,
          pricingMode: mode,
          ...(mode === "MANUAL" ? { usdcAmount: usdc } : {}),
          expiresInMinutes: expiry,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(customerRef.trim() ? { customerRef: customerRef.trim().replace(/^#/, "") } : {}),
        },
        { headers: { "Idempotency-Key": keyRef.current } },
      );
      router.push(`/requests/${res.request.id}?share=1`);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "RATE_NOT_SET" ? "Set a fixed rate in Settings first, or type the USDC amount." : errorMessage(err));
      setBusy(false);
    }
  };

  const rate = merchant?.pricing.fixedRate;
  const preview = quote.status === "ok" ? quote.quote : null;

  return (
    <>
      <PageHeader title="New request" kicker={<Link href="/requests">Requests</Link>} />
      <form className="content" onSubmit={create} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", alignItems: "start" }}>
        <div className="card stack">
          <div className="field">
            <label htmlFor="zar" className="label">
              Amount in rand
            </label>
            <div className="money-input">
              <span className="unit">R</span>
              <input id="zar" inputMode="decimal" autoComplete="off" placeholder="500.00" value={zar} onChange={(e) => setZar(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))} autoFocus />
            </div>
          </div>

          <div className="field">
            <span className="label" id="mode-label">
              How is the USDC amount set?
            </span>
            <div className="seg" role="group" aria-labelledby="mode-label">
              <button type="button" aria-pressed={mode === "FIXED_RATE"} onClick={() => setMode("FIXED_RATE")} disabled={!hasRate}>
                {hasRate && rate ? `My rate R${formatRate(rate)}` : "My rate (not set)"}
              </button>
              <button type="button" aria-pressed={mode === "MANUAL"} onClick={() => setMode("MANUAL")}>
                Type USDC
              </button>
            </div>
            {!hasRate && (
              <span className="hint">
                <Link href="/settings" style={{ color: "var(--protea)", fontWeight: 700 }}>
                  Set a fixed rate in Settings
                </Link>{" "}
                to work out the USDC for you.
              </span>
            )}
          </div>

          {mode === "MANUAL" && (
            <label className="field">
              <span className="label">Amount in USDC</span>
              <input className="input" inputMode="decimal" autoComplete="off" placeholder="27.03" value={usdc} onChange={(e) => setUsdc(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))} />
            </label>
          )}

          <div className="grid-2" style={{ gap: 12 }}>
            <label className="field">
              <span className="label">Description (optional)</span>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Birthday cake" maxLength={200} />
            </label>
            <label className="field">
              <span className="label">Order number (optional)</span>
              <input className="input" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} placeholder="1042" maxLength={64} />
            </label>
          </div>

          <label className="field">
            <span className="label">Receiving wallet</span>
            {walletsLoading ? (
              <div className="skeleton" style={{ height: 48 }} />
            ) : wallets.length === 0 ? (
              <div className="alert alert-warn">
                <span>
                  Connect and verify a wallet first.{" "}
                  <Link href="/wallets" style={{ fontWeight: 800 }}>
                    Go to Wallets
                  </Link>
                </span>
              </div>
            ) : (
              <select className="select" value={walletId} onChange={(e) => setWalletId(e.target.value)}>
                {wallets.map((w) => {
                  const problem = cannotReceiveText(w);
                  return (
                    <option key={w.id} value={w.id} disabled={Boolean(problem)}>
                      {w.label ?? "Wallet"} · {shortAddress(w.address)} {problem ? `(can't take USDC)` : "✓"}
                    </option>
                  );
                })}
              </select>
            )}
          </label>

          <label className="field">
            <span className="label">Expires after</span>
            <select
              className="select"
              value={customExpiry ? "custom" : String(expiry)}
              onChange={(e) => {
                if (e.target.value === "custom") setCustomExpiry(true);
                else {
                  setCustomExpiry(false);
                  setExpiry(Number.parseInt(e.target.value, 10));
                }
              }}
            >
              {EXPIRY_PRESETS.map((p) => (
                <option key={p.minutes} value={p.minutes}>
                  {p.label}
                </option>
              ))}
              {!EXPIRY_PRESETS.some((p) => p.minutes === expiry) && !customExpiry && <option value={expiry}>{expiry} minutes</option>}
              <option value="custom">Custom…</option>
            </select>
            {customExpiry && (
              <span className="row">
                <input
                  className="input"
                  type="number"
                  min={5}
                  max={43200}
                  value={expiry}
                  onChange={(e) => setExpiry(Math.min(43200, Math.max(5, Number.parseInt(e.target.value || "5", 10))))}
                  style={{ width: 140 }}
                  aria-label="Minutes until it expires"
                />
                <span className="hint">minutes (5 to 43,200)</span>
              </span>
            )}
          </label>
        </div>

        <div className="stack" style={{ position: "sticky", top: 90 }}>
          <div className="card-dark stack" aria-live="polite" style={{ gap: 10 }}>
            <span style={{ fontSize: 13, color: "var(--on-dark-2)" }}>Customer will pay</span>
            <span className="big-figure" style={{ fontSize: "clamp(40px, 5vw, 56px)" }}>
              {preview ? formatAmount(preview.usdcAmount) : quote.status === "loading" ? "…" : "0.00"} <span style={{ fontSize: 18, color: "var(--sun)" }}>USDC</span>
            </span>
            <span style={{ fontSize: 13, color: "var(--on-dark-2)" }}>
              {preview
                ? preview.pricing.mode === "FIXED_RATE" && preview.pricing.rate
                  ? `For ${formatZar(preview.zarAmount)} at your rate R${formatRate(preview.pricing.rate)} = 1 USDC, rounded up to the cent.`
                  : `For ${formatZar(preview.zarAmount)}. That's R${formatRate(preview.pricing.impliedRate ?? "0")} per USDC (information only).`
                : mode === "MANUAL"
                  ? "Type the rand and the USDC amount."
                  : "Type the rand amount."}
            </span>
            {quote.status === "error" && (
              <span role="alert" style={{ color: "var(--sun)", fontWeight: 700, fontSize: 14 }}>
                {quote.message}
              </span>
            )}
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!canCreate} aria-busy={busy}>
            {busy ? <span className="spinner" /> : <Icon name="plus" size={18} stroke={3} />}
            Create request
          </button>
          <span className="hint" style={{ textAlign: "center" }}>
            Only the USDC is checked on Stellar. The rand is there so nobody does sums at the till.
          </span>
        </div>
      </form>
    </>
  );
}
