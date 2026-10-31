import Link from "next/link";
import { Lockup } from "@/components/Logo";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 24, textAlign: "center" }}>
      <Lockup size={26} />
      <h1 className="display" style={{ fontSize: "clamp(40px, 8vw, 72px)" }}>
        Not here.
      </h1>
      <p className="muted" style={{ margin: 0 }}>
        That page doesn&apos;t exist. Check the link, or head home.
      </p>
      <Link href="/" className="btn btn-dark">
        Go home
      </Link>
    </main>
  );
}
