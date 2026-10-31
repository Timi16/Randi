"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { LiveProvider } from "@/lib/live";
import { useMe } from "@/lib/session";

/** Everything under (app) needs a signed-in merchant with a confirmed email. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { merchant, error, mutate } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (merchant === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (merchant && !merchant.emailVerified) router.replace("/verify-email");
  }, [merchant, pathname, router]);

  if (error) {
    return (
      <div className="empty" style={{ minHeight: "100vh", justifyContent: "center" }}>
        <strong>We can&apos;t reach Randi right now</strong>
        <span>Your data is safe. Check your connection and try again.</span>
        <button type="button" className="btn btn-dark" onClick={() => mutate()} style={{ marginTop: 8 }}>
          Try again
        </button>
      </div>
    );
  }
  if (!merchant || !merchant.emailVerified) return <div style={{ minHeight: "100vh" }} aria-busy="true" />;
  return (
    <LiveProvider>
      <AppShell merchant={merchant}>{children}</AppShell>
    </LiveProvider>
  );
}
