"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { api, errorMessage } from "@/lib/api";
import { EXPIRY_PRESETS, expiryLabel } from "@/lib/expiry";
import { formatDateTime, formatRate, shortAddress, timeAgo } from "@/lib/format";
import { useLogout, useMe, useWallets } from "@/lib/session";
import type { Merchant, PricingMode, PricingSettings, Session } from "@/lib/types";
import { RateInput } from "./_components/RateInput";

type Tab = "business" | "pricing" | "security";


export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("business");
  const { merchant } = useMe();
  if (!merchant) return null;
  return (
    <>
      <PageHeader title="Settings" kicker={merchant.businessName} />
      <div className="content" style={{ maxWidth: 760 }}>
        <div className="seg" role="tablist" aria-label="Settings" style={{ maxWidth: 420 }}>
          {(["business", "pricing", "security"] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t[0]?.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        {tab === "business" && <BusinessTab merchant={merchant} />}
        {tab === "pricing" && <PricingTab merchant={merchant} />}
        {tab === "security" && <SecurityTab />}
      </div>
    </>
  );
}

function BusinessTab({ merchant }: { merchant: Merchant }) {
  const { mutate } = useMe();
  const { data: wallets } = useWallets();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verified = (wallets?.data ?? []).filter((w) => w.verified);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const support = String(form.get("supportContact") ?? "").trim();
    const walletId = String(form.get("defaultWalletId") ?? "");
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ merchant: Merchant }>("/auth/settings", {
        businessName: String(form.get("businessName") ?? "").trim(),
        supportContact: support || null,
        defaultWalletId: walletId || null,
        defaultExpiryMinutes: Number.parseInt(String(form.get("defaultExpiryMinutes") ?? "30"), 10),
      });
      await mutate(res, { revalidate: false });
      toast("Saved");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const presets = EXPIRY_PRESETS.some((p) => p.minutes === merchant.defaultExpiryMinutes)
    ? EXPIRY_PRESETS
    : [...EXPIRY_PRESETS, { label: expiryLabel(merchant.defaultExpiryMinutes), minutes: merchant.defaultExpiryMinutes }];

  return (
    <form className="card stack" onSubmit={save}>
      <h2 className="card-title">Business</h2>
      <label className="field">
        <span className="label">Business name</span>
        <input className="input" name="businessName" defaultValue={merchant.businessName} required maxLength={100} />
        <span className="hint">Customers see this on the payment page.</span>
      </label>
      <label className="field">
        <span className="label">Support contact (optional)</span>
        <input className="input" name="supportContact" defaultValue={merchant.supportContact ?? ""} maxLength={100} placeholder="WhatsApp 082 555 0123" />
        <span className="hint">Shown on the payment page as &ldquo;Need help?&rdquo;</span>
      </label>
      <h2 className="card-title" style={{ marginTop: 8 }}>
        Defaults for new requests
      </h2>
      <div className="grid-2">
        <label className="field">
          <span className="label">Receiving wallet</span>
          <select className="select" name="defaultWalletId" defaultValue={merchant.defaultWalletId ?? ""}>
            <option value="">Choose each time</option>
            {verified.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label ?? "Wallet"} · {shortAddress(w.address)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">Expires after</span>
          <select className="select" name="defaultExpiryMinutes" defaultValue={String(merchant.defaultExpiryMinutes)}>
            {presets.map((p) => (
              <option key={p.minutes} value={p.minutes}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="btn btn-dark" style={{ alignSelf: "flex-start" }} disabled={busy}>
        {busy && <span className="spinner" />} Save changes
      </button>
    </form>
  );
}

function PricingTab({ merchant }: { merchant: Merchant }) {
  const { mutate } = useMe();
  const toast = useToast();
  const pricing = merchant.pricing;
  const [mode, setMode] = useState<PricingMode>(pricing.defaultMode);
  const [rate, setRate] = useState(pricing.fixedRate ? formatRate(pricing.fixedRate).replace(/,/g, "") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMode(pricing.defaultMode), [pricing.defaultMode]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: { defaultMode: PricingMode; fixedRate?: string } = { defaultMode: mode };
      if (rate.trim()) body.fixedRate = rate.trim();
      await api.put<{ pricing: PricingSettings }>("/v1/pricing", body);
      await mutate();
      toast("Pricing saved");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h2 className="card-title">How new requests set the USDC</h2>
      <div className="seg" role="group" aria-label="Default pricing">
        <button type="button" aria-pressed={mode === "FIXED_RATE"} onClick={() => setMode("FIXED_RATE")}>
          Use my fixed rate
        </button>
        <button type="button" aria-pressed={mode === "MANUAL"} onClick={() => setMode("MANUAL")}>
          I&apos;ll type the USDC
        </button>
      </div>
      <RateInput value={rate} onChange={setRate} />
      {pricing.rateUpdatedAt && <span className="hint">Last changed {formatDateTime(pricing.rateUpdatedAt)}</span>}
      <div className="alert alert-info">This is your own rate. Randi doesn&apos;t fetch exchange rates. Changing it only affects new requests.</div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <button type="button" className="btn btn-dark" style={{ alignSelf: "flex-start" }} onClick={save} disabled={busy || (mode === "FIXED_RATE" && !rate.trim())}>
        {busy && <span className="spinner" />} Save pricing
      </button>
    </div>
  );
}

function SecurityTab() {
  const toast = useToast();
  const logout = useLogout();
  const { data: sessions, mutate } = useSWR<{ data: Session[] }>("/auth/sessions");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password", { currentPassword: String(form.get("current") ?? ""), newPassword: String(form.get("next") ?? "") });
      formEl.reset();
      toast("Password changed. Other devices are signed out.");
      void mutate();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    await api.delete(`/auth/sessions/${id}`).catch(() => undefined);
    void mutate();
  };

  return (
    <>
      <form className="card stack" onSubmit={changePassword}>
        <h2 className="card-title">Change password</h2>
        <div className="grid-2">
          <label className="field">
            <span className="label">Current password</span>
            <input className="input" name="current" type="password" autoComplete="current-password" required />
          </label>
          <label className="field">
            <span className="label">New password</span>
            <input className="input" name="next" type="password" autoComplete="new-password" minLength={10} required />
          </label>
        </div>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn btn-dark" style={{ alignSelf: "flex-start" }} disabled={busy}>
          {busy && <span className="spinner" />} Change password
        </button>
      </form>
      <div className="card stack">
        <div className="between">
          <h2 className="card-title">Where you&apos;re signed in</h2>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={async () => {
              await api.post("/auth/sessions/logout-others").catch(() => undefined);
              void mutate();
              toast("Signed out everywhere else");
            }}
          >
            Sign out others
          </button>
        </div>
        {(sessions?.data ?? []).map((s) => (
          <div key={s.id} className="list-row">
            <span className="row-icon tone-neutral">
              <Icon name="shield" size={18} />
            </span>
            <span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>
                {deviceName(s.userAgent)} {s.current && <span className="pill tone-good" style={{ height: 20, marginLeft: 6 }}>This device</span>}
              </strong>
              <span className="hint">Last active {timeAgo(s.lastSeenAt)}</span>
            </span>
            {!s.current && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void revoke(s.id)}>
                Sign out
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-outline" style={{ alignSelf: "flex-start" }} onClick={logout}>
        <Icon name="logout" size={16} /> Sign out
      </button>
    </>
  );
}

function deviceName(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}
