import { describe, expect, it } from "vitest";
import { countdown, formatAmount, formatZar, fromStroops, looksLikeAddress, looksLikeSecret, plainAmount, shortAddress, toStroops } from "@/lib/format";

describe("amount formatting (strings only, never floats)", () => {
  it("trims stroops to two decimals and groups thousands", () => {
    expect(formatAmount("27.0300000")).toBe("27.03");
    expect(formatAmount("1840.5")).toBe("1,840.50");
    expect(formatAmount("0.0000001")).toBe("0.0000001");
    expect(formatAmount("922337203685.4775807")).toBe("922,337,203,685.4775807");
  });

  it("formats rand with the R prefix", () => {
    expect(formatZar("24180")).toBe("R24,180.00");
    expect(formatZar("92.50")).toBe("R92.50");
  });

  it("gives wallets a plain amount with no separators", () => {
    expect(plainAmount("1200.0000000")).toBe("1200.00");
  });

  it("round-trips stroops exactly", () => {
    for (const v of ["0.0000001", "27.0300000", "922337203685.4775807", "5.0000000"]) {
      expect(fromStroops(toStroops(v))).toBe(v);
    }
    expect(toStroops("27.03") - toStroops("19.03")).toBe(80_000_000n);
  });
});

describe("addresses and keys", () => {
  const address = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  it("shortens addresses", () => {
    expect(shortAddress(address)).toBe("GBBD…FLA5");
  });

  it("F9 spots a pasted secret key before anything is sent", () => {
    const secret = `S${"A".repeat(55)}`;
    expect(looksLikeSecret(secret)).toBe(true);
    expect(looksLikeSecret(`  ${secret} `)).toBe(true);
    expect(looksLikeSecret(address)).toBe(false);
    expect(looksLikeAddress(address)).toBe(true);
    expect(looksLikeAddress(secret)).toBe(false);
  });
});

describe("countdown", () => {
  it("shows mm:ss, h:mm:ss and days", () => {
    const now = Date.parse("2026-10-31T12:00:00Z");
    expect(countdown("2026-10-31T12:29:41Z", now)).toBe("29:41");
    expect(countdown("2026-10-31T14:05:09Z", now)).toBe("2:05:09");
    expect(countdown("2026-11-04T12:00:00Z", now)).toBe("4 days");
    expect(countdown("2026-10-31T11:00:00Z", now)).toBe("00:00");
  });
});
