"use client";

import { formatStroops, parseRate, parseZar, usdcForZar } from "@randi/shared";
import { formatAmount } from "@/lib/format";

/** "R [18.50] = 1 USDC" with a live example worked out exactly as the API will. */
export function RateInput({ value, onChange, id = "rate" }: { value: string; onChange: (v: string) => void; id?: string }) {
  const units = parseRate(value.trim());
  const valid = units !== null && units >= 10_000n && units <= 10_000_000n;
  const example = valid ? formatAmount(formatStroops(usdcForZar(parseZar("500") ?? 0n, units))) : null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label htmlFor={id} className="label">
        Your rate
      </label>
      <div className="money-input" style={{ height: 58 }}>
        <span className="unit" style={{ fontSize: 22 }}>
          R
        </span>
        <input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(",", "."))} aria-invalid={!valid} aria-describedby={`${id}-example`} style={{ fontSize: 26 }} />
        <span style={{ fontWeight: 800, color: "var(--muted)", whiteSpace: "nowrap" }}>= 1 USDC</span>
      </div>
      <span id={`${id}-example`} className={valid ? "hint" : "field-error"}>
        {valid ? `Example: R500.00 asks for ${example} USDC (rounded up to the next cent).` : "Enter a rate between R1 and R1,000, up to 4 decimals."}
      </span>
    </div>
  );
}
