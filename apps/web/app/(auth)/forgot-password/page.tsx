"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import styles from "../auth.module.css";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password/forgot", { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className={styles.title}>Reset your password.</h1>
      {sent ? (
        <div className="alert alert-good">If that email has a Randi account, a reset link is on its way. It works for 30 minutes.</div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <span style={{ color: "var(--text-2)" }}>We&apos;ll email you a link to choose a new one.</span>
          <label className="field">
            <span className="label">Email</span>
            <input className="input" name="email" type="email" autoComplete="email" required />
          </label>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy && <span className="spinner" />}
            Email me a link
          </button>
        </form>
      )}
      <Link href="/login" style={{ fontWeight: 700, color: "var(--protea)", textDecoration: "none" }}>
        Back to sign in
      </Link>
    </>
  );
}
