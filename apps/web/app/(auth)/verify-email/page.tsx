"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useLogout, useMe } from "@/lib/session";
import type { Merchant } from "@/lib/types";
import styles from "../auth.module.css";

export default function VerifyEmailPage() {
  const router = useRouter();
  const { merchant, mutate } = useMe();
  const logout = useLogout();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (merchant === null) router.replace("/login");
    else if (merchant?.emailVerified) router.replace("/get-started");
  }, [merchant, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ merchant: Merchant }>("/auth/email/verify", { code });
      await mutate(res, { revalidate: false });
      router.replace("/get-started");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await api.post("/auth/email/resend");
      setResent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <h1 className={styles.title}>Check your email.</h1>
      <span style={{ color: "var(--text-2)" }}>We sent a 6-digit code to {merchant?.email ?? "your email"}. Enter it to open your dashboard.</span>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span className="label">Code</span>
          <input
            className="input mono"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123 456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ fontSize: 22, letterSpacing: "0.3em", height: 56 }}
          />
        </label>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {resent && <div className="alert alert-good">A new code is on its way.</div>}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || code.replace(/\s/g, "").length !== 6}>
          {busy && <span className="spinner" />}
          Confirm email
        </button>
      </form>
      <div className="between">
        <button type="button" className="btn btn-ghost btn-sm" onClick={resend}>
          Send a new code
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
          Use another account
        </button>
      </div>
    </>
  );
}
