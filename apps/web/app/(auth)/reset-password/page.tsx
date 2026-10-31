"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import styles from "../auth.module.css";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const newPassword = String(new FormData(e.currentTarget).get("password") ?? "");
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password/reset", { token, newPassword });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <h1 className={styles.title}>Password changed.</h1>
        <span>You&apos;re signed out everywhere. Sign in with the new password.</span>
        <Link href="/login" className="btn btn-primary btn-lg btn-block">
          Sign in
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className={styles.title}>Choose a new password.</h1>
      {!token && <div className="alert">This reset link is incomplete. Ask for a new one.</div>}
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span className="label">New password</span>
          <input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required placeholder="At least 10 characters" />
        </label>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || !token}>
          {busy && <span className="spinner" />}
          Change password
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
