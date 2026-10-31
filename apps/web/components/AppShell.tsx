"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { initials } from "@/lib/format";
import { useLive } from "@/lib/live";
import { useLogout, useUnmatchedCount } from "@/lib/session";
import type { Merchant } from "@/lib/types";
import { Icon, type IconKey } from "./Icon";
import { Lockup } from "./Logo";

interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
}

const NAV: NavItem[] = [
  { href: "/overview", label: "Overview", icon: "home" },
  { href: "/requests", label: "Requests", icon: "receipt" },
  { href: "/payments", label: "Payments", icon: "inbox" },
  { href: "/wallets", label: "Wallets", icon: "wallet" },
  { href: "/settings", label: "Settings", icon: "sliders" },
];

const isActive = (pathname: string, href: string) =>
  href === "/requests" ? pathname === "/requests" || (pathname.startsWith("/requests/") && pathname !== "/requests/new") : pathname.startsWith(href);

/** Page header inside the shell: kicker, title and optional actions on the right. */
export function PageHeader({ title, kicker, actions }: { title: string; kicker?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="topbar">
      <div className="stack" style={{ gap: 0, minWidth: 0 }}>
        {kicker && <span style={{ fontSize: 13, color: "var(--muted)" }}>{kicker}</span>}
        <h1>{title}</h1>
      </div>
      <div className="row">
        {actions}
        <span className="testnet-pill">Testnet</span>
      </div>
    </header>
  );
}

/** Dashboard shell (docs/Frontend.md §2.8): dark sidebar on desktop, bottom tab bar on phones. */
export function AppShell({ merchant, children }: { merchant: Merchant; children: React.ReactNode }) {
  const pathname = usePathname();
  const unmatched = useUnmatchedCount();
  const logout = useLogout();
  const { announcement } = useLive();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);

  const moreActive = pathname.startsWith("/wallets") || pathname.startsWith("/settings");

  return (
    <div className="shell">
      <a href="#main" className="sr-only">
        Skip to content
      </a>
      <aside className="side" aria-label="Sidebar">
        <Link href="/overview" aria-label="Randi overview" style={{ padding: "0 8px", textDecoration: "none" }}>
          <Lockup dark size={24} />
        </Link>
        <nav className="side-nav" aria-label="Main">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
              <Icon name={item.icon} size={20} />
              {item.label}
              {item.href === "/payments" && unmatched ? <span className="side-badge">{unmatched}</span> : null}
            </Link>
          ))}
        </nav>
        <Link href="/requests/new" className="btn btn-primary" aria-current={pathname === "/requests/new" ? "page" : undefined}>
          <Icon name="plus" size={16} stroke={3} />
          New request
        </Link>
        <div className="side-card">
          <span className="testnet-pill" style={{ alignSelf: "flex-start", height: 24 }}>
            Stellar Testnet
          </span>
          Test money only. Nothing here is real.
        </div>
        <div className="side-user">
          <span className="avatar">{initials(merchant.businessName)}</span>
          <span className="stack" style={{ gap: 0, minWidth: 0, flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{merchant.businessName}</span>
            <span style={{ fontSize: 12, color: "var(--muted-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{merchant.email}</span>
          </span>
          <button type="button" onClick={logout} className="icon-btn" style={{ background: "var(--ink-2)", color: "var(--on-dark-2)" }} aria-label="Sign out" title="Sign out">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <div className="main" id="main">
        {children}
      </div>

      <nav className="tabbar" aria-label="Main">
        <TabLink href="/overview" label="Home" icon="home" active={isActive(pathname, "/overview")} />
        <TabLink href="/requests" label="Requests" icon="receipt" active={isActive(pathname, "/requests")} />
        <span className="tab-fab-wrap">
          <Link href="/requests/new" className="tab-fab" aria-label="New request" aria-current={pathname === "/requests/new" ? "page" : undefined}>
            <Icon name="plus" size={24} stroke={2.6} />
          </Link>
        </span>
        <TabLink href="/payments" label="Payments" icon="inbox" active={isActive(pathname, "/payments")} />
        <button type="button" className="tab" aria-current={moreActive ? "page" : undefined} aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)} style={{ border: 0, background: "transparent", cursor: "pointer" }}>
          <span className="tab-icon">
            <Icon name="grid" size={22} stroke={moreActive ? 2.1 : 1.8} filled={moreActive} />
          </span>
          More
        </button>
      </nav>
      {moreOpen && (
        <div className="more-menu" role="menu">
          <Link href="/wallets" role="menuitem">
            <Icon name="wallet" size={18} /> Wallets
          </Link>
          <Link href="/settings" role="menuitem">
            <Icon name="sliders" size={18} /> Settings
          </Link>
          <button type="button" role="menuitem" onClick={logout}>
            <Icon name="logout" size={18} /> Sign out
          </button>
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}

function TabLink({ href, label, icon, active }: { href: string; label: string; icon: IconKey; active: boolean }) {
  return (
    <Link href={href} className="tab" aria-current={active ? "page" : undefined}>
      <span className="tab-icon">
        <Icon name={icon} size={22} stroke={active ? 2.1 : 1.8} filled={active} />
      </span>
      {label}
    </Link>
  );
}
