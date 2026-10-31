"use client";

import { useEffect, useState } from "react";

/** Renders `value` as an SVG QR code. The library loads only when a QR is shown. */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const [qr, setQr] = useState<{ value: string; src: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((mod) => {
        // CommonJS package: depending on the bundler the functions sit on the namespace or on `default`.
        const lib = mod.default ?? mod;
        return lib.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0E0B10", light: "#FFFFFF" } });
      })
      .then((svg) => {
        if (live) setQr({ value, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
      })
      .catch(() => {
        if (live) setQr({ value, src: null });
      });
    return () => {
      live = false;
    };
  }, [value]);

  const ready = qr && qr.value === value ? qr : null;
  if (!ready) return <div className="skeleton" style={{ width: size, height: size }} aria-label="Drawing the QR code" />;
  if (!ready.src) {
    return (
      <div className="alert" role="alert" style={{ width: size }}>
        Couldn&apos;t draw the QR code. Use the details instead.
      </div>
    );
  }
  return <img src={ready.src} width={size} height={size} alt={label} style={{ imageRendering: "pixelated", display: "block" }} />;
}
