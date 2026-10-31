"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/session";
import type { Merchant } from "@/lib/types";
import styles from "../auth.module.css";

type Mode = "signup" | "login";

/** Only same-site paths are followed after sign-in. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/** Sign up and sign in share one page with a pill switch (docs/Frontend.md §5.1). */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate } = useSWRConfig();
  const { merchant } = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const signup = mode === "signup";

  // Already signed in: go straight to the dashboard.
  useEffect(() => {
    if (merchant && merchant.emailVerified) router.replace(safeNext(params.get("next")) ?? "/overview");
  }, [merchant, params, router]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const body = signup
        ? { businessName: String(form.get("businessName") ?? ""), email, password }
        : { email, password, remember: form.get("remember") === "on" };
      const res = await api.post<{ merchant: Merchant }>(signup ? "/auth/signup" : "/auth/login", body);
      await mutate("/auth/me", res, { revalidate: false });
      if (!res.merchant.emailVerified) router.replace("/verify-email");
      else router.replace(signup ? "/get-started" : (safeNext(params.get("next")) ?? "/overview"));
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") {
        const next: Record<string, string> = {};
        for (const d of err.details) if (d.path && d.message) next[d.path] = d.message;
        setFieldErrors(next);
      }
      setError(err instanceof ApiError && err.code === "INVALID_CREDENTIALS" ? "That email and password don't match. Try again." : errorMessage(err));
      setBusy(false);
    }
  };

  const fieldError = (name: string) =>
    fieldErrors[name] ? (
      <span id={`${name}-error`} className="field-error">
        {fieldErrors[name]}
      </span>
    ) : null;

  return (
    <>
      <div className="seg" role="tablist" aria-label="Account">
        <button type="button" role="tab" aria-selected={signup} onClick={() => router.replace("/signup")}>
          Create account
        </button>
        <button type="button" role="tab" aria-selected={!signup} onClick={() => router.replace(`/login${params.get("next") ? `?next=${encodeURIComponent(params.get("next") ?? "")}` : ""}`)}>
          Sign in
        </button>
      </div>
      <h1 className={styles.title}>{signup ? "Start getting paid." : "Welcome back."}</h1>
      <span style={{ color: "var(--text-2)", marginTop: -6 }}>{signup ? "Free on Testnet. Takes about a minute." : "Sign in to your Randi dashboard."}</span>
      <form className="stack" onSubmit={submit} noValidate>
        {signup && (
          <label className="field">
            <span className="label">Business name</span>
            <input className="input" name="businessName" autoComplete="organization" placeholder="Thandi's Bakery" required maxLength={100} aria-invalid={Boolean(fieldErrors.businessName)} />
            {fieldError("businessName")}
          </label>
        )}
        <label className="field">
          <span className="label">Email</span>
          <input className="input" name="email" type="email" autoComplete="email" placeholder="you@business.co.za" required aria-invalid={Boolean(fieldErrors.email)} />
          {fieldError("email")}
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input
            className="input"
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            placeholder={signup ? "At least 10 characters" : "Your password"}
            required
            minLength={signup ? 10 : 1}
            aria-invalid={Boolean(fieldErrors.password)}
          />
          {fieldError("password")}
        </label>
        {!signup && (
          <div className="between">
            <label className="check">
              <input type="checkbox" name="remember" defaultChecked /> Keep me signed in
            </label>
            <Link href="/forgot-password" style={{ fontSize: 14, fontWeight: 700, color: "var(--protea)", textDecoration: "none" }}>
              Forgot password?
            </Link>
          </div>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" />}
          {signup ? "Create account" : "Sign in"}
        </button>
      </form>
    </>
  );
}
