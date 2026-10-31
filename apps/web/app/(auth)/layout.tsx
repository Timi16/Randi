import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Lockup } from "@/components/Logo";
import styles from "./auth.module.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className="between">
          <Link href="/" aria-label="Randi home" style={{ textDecoration: "none" }}>
            <Lockup size={24} />
          </Link>
          <span className="testnet-pill">Testnet</span>
        </div>
        <main className={styles.form}>{children}</main>
        <span className="hint">Stellar Testnet only. Test money, no real value.</span>
      </div>
      <div className={styles.photo} aria-hidden="true">
        <div className={styles.photoInner}>
          <Image src="/photos/phone-yellow.jpg" alt="" fill sizes="50vw" style={{ objectFit: "cover", objectPosition: "30% 50%" }} priority />
          <div className={styles.proof}>
            <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--paid)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="check" size={18} stroke={3.2} />
            </span>
            <span className="stack" style={{ gap: 0 }}>
              <span style={{ fontWeight: 800 }}>R500.00 · Paid</span>
              <span style={{ fontSize: 12, color: "var(--on-dark-2)" }}>27.03 USDC · verified on Stellar · example</span>
            </span>
          </div>
          <span className={styles.credit}>Photo: Ahmed Nasiru / Unsplash</span>
        </div>
      </div>
    </div>
  );
}
