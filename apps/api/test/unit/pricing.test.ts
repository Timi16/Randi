import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatRate, formatZar, impliedRate, parseRate, parseZar, usdcForZar } from "../../src/lib/amount";
import { priceRequest } from "../../src/lib/pricing";

const RATE_18_50 = 185_000n;
const merchant = (fixedRate: bigint | null = RATE_18_50, defaultPricingMode: "MANUAL" | "FIXED_RATE" = "MANUAL") => ({
  fixedRate,
  defaultPricingMode,
});

describe("ZAR and rate strings", () => {
  it("parses and formats rand as integer cents", () => {
    expect(parseZar("500")).toBe(50_000n);
    expect(parseZar("500.5")).toBe(50_050n);
    expect(parseZar("0.01")).toBe(1n);
    expect(parseZar("1000000.00")).toBe(100_000_000n);
    for (const bad of ["", "1.005", "-1", "1e3", "R500", "5,00", " 5", "12345678"]) expect(parseZar(bad), bad).toBeNull();
    expect(formatZar(50_050n)).toBe("500.50");
    expect(formatZar(1n)).toBe("0.01");
  });

  it("parses and formats the rate with 4 decimals", () => {
    expect(parseRate("18.5")).toBe(185_000n);
    expect(parseRate("18.5432")).toBe(185_432n);
    expect(parseRate("18.54321")).toBeNull();
    expect(formatRate(185_000n)).toBe("18.5000");
  });
});

describe("pricing", () => {
  it("Z1: MANUAL keeps both amounts exactly as typed, with no rate", () => {
    expect(priceRequest(merchant(), { zarAmount: "500.00", usdcAmount: "27" })).toEqual({
      zarAmountCents: 50_000n,
      usdcAmountStroops: 270_000_000n,
      pricingMode: "MANUAL",
      rateSnapshot: null,
    });
    // The implied rate is for display only: 500 / 27 = 18.5185…
    expect(formatRate(impliedRate(50_000n, 270_000_000n) as bigint)).toBe("18.5185");
  });

  it("Z2: FIXED_RATE R500.00 at 18.50 is 27.03 USDC (27.027… rounded up)", () => {
    expect(priceRequest(merchant(), { zarAmount: "500.00", pricingMode: "FIXED_RATE" })).toEqual({
      zarAmountCents: 50_000n,
      usdcAmountStroops: 270_300_000n,
      pricingMode: "FIXED_RATE",
      rateSnapshot: RATE_18_50,
    });
    expect(usdcForZar(185_000n, RATE_18_50)).toBe(1_000_000_000n); // R1,850.00 = exactly 100.00 USDC
  });

  it("Z3: FIXED_RATE never rounds down: R100.00 at 18.00 is 5.56, not 5.55", () => {
    expect(usdcForZar(10_000n, 180_000n)).toBe(55_600_000n);
  });

  it("Z3: the USDC amount is never below the exact quotient and never more than 0.01 above it", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 100_000_000n }), // R0.01 .. R1,000,000.00
        fc.bigInt({ min: 10_000n, max: 10_000_000n }), // R1 .. R1,000 per USDC
        (cents, rate) => {
          const stroops = usdcForZar(cents, rate);
          const exactNumerator = cents * 1_000_000_000n; // exact stroops = this / rate
          expect(stroops * rate >= exactNumerator).toBe(true);
          expect((stroops - 100_000n) * rate < exactNumerator).toBe(true);
          expect(stroops % 100_000n).toBe(0n);
        },
      ),
    );
  });

  it("Z6: FIXED_RATE with no rate set is RATE_NOT_SET", () => {
    expect(() => priceRequest(merchant(null), { zarAmount: "100", pricingMode: "FIXED_RATE" })).toThrow(
      expect.objectContaining({ code: "RATE_NOT_SET" }),
    );
  });

  it("Z7: a result under 0.01 USDC is AMOUNT_TOO_SMALL", () => {
    // R0.01 at R1,000 per USDC is 0.00001 USDC: rounds up to 0.01, which is allowed...
    expect(priceRequest(merchant(10_000_000n), { zarAmount: "0.01", pricingMode: "FIXED_RATE" }).usdcAmountStroops).toBe(100_000n);
    // ...but a manual amount under 0.01 is refused.
    expect(() => priceRequest(merchant(), { zarAmount: "1", usdcAmount: "0.0099999" })).toThrow(
      expect.objectContaining({ code: "AMOUNT_TOO_SMALL" }),
    );
  });

  it("Z8: FIXED_RATE with a usdcAmount is refused; MANUAL without one is refused", () => {
    expect(() => priceRequest(merchant(), { zarAmount: "100", pricingMode: "FIXED_RATE", usdcAmount: "5" })).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    expect(() => priceRequest(merchant(), { zarAmount: "100", pricingMode: "MANUAL" })).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
  });

  it("uses the merchant's default mode when the request does not say", () => {
    expect(priceRequest(merchant(RATE_18_50, "FIXED_RATE"), { zarAmount: "185" }).usdcAmountStroops).toBe(100_000_000n);
    expect(priceRequest(merchant(RATE_18_50, "MANUAL"), { zarAmount: "185", usdcAmount: "11" }).usdcAmountStroops).toBe(110_000_000n);
  });
});
