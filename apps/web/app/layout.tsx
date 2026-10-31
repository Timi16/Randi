import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/lib/session";
import "./globals.css";

// latin-ext carries the dotless ı the wordmark is built on.
const archivo = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Randi · charge in rand, get paid in USDC", template: "%s · Randi" },
  description: "Payment requests in rand, paid in USDC on Stellar Testnet and verified on-chain.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0E0B10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={`${archivo.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
