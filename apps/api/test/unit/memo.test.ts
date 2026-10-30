import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateMemo, idToMemo, memoToId, normalizeMemo } from "../../src/lib/memo";

describe("memo", () => {
  it("generates RD + 8 Crockford characters", () => {
    for (let i = 0; i < 200; i++) expect(generateMemo()).toMatch(/^RD[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("P4: normalises lowercase, O for 0, I/L for 1, spaces and dashes", () => {
    expect(normalizeMemo("RD7K2M9QXA")).toBe("RD7K2M9QXA");
    expect(normalizeMemo("rd7k2m9qxa")).toBe("RD7K2M9QXA");
    expect(normalizeMemo("  RD-7K2M 9QXA ")).toBe("RD7K2M9QXA");
    expect(normalizeMemo("RDO0OOOOOO")).toBe("RD00000000");
    expect(normalizeMemo("RDIL1il1AB")).toBe("RD111111AB");
    expect(normalizeMemo("rd 0o-1i-lL-ZZ")).toBe("RD001111ZZ");
  });

  it("P15: every memo has a numeric form (40 bits) that maps back to it", () => {
    expect(memoToId("RD00000000")).toBe(0n);
    expect(memoToId("RD00000010")).toBe(32n);
    expect(memoToId("RDZZZZZZZZ")).toBe(2n ** 40n - 1n);
    expect(idToMemo("0")).toBe("RD00000000");
    expect(idToMemo("1099511627775")).toBe("RDZZZZZZZZ");
    for (const bad of ["1099511627776", "-1", "1.5", "", "abc", "99999999999999999999"]) expect(idToMemo(bad), bad).toBeNull();
    fc.assert(
      fc.property(fc.constant(null).map(generateMemo), (memo) => {
        expect(idToMemo(memoToId(memo).toString())).toBe(memo);
      }),
    );
  });

  it("rejects anything that is not a Randi memo", () => {
    for (const bad of ["", "RD", "RD7K2M9QX", "RD7K2M9QXAB", "XX7K2M9QXA", "RD7K2M9QXU", "hello", "RD7K2M9QX!", "1234567890"]) {
      expect(normalizeMemo(bad), bad).toBeNull();
    }
  });

  it("P4: every generated memo survives being retyped in any case with separators", () => {
    fc.assert(
      fc.property(fc.constant(null).map(generateMemo), fc.boolean(), (memo, lower) => {
        const typed = `${memo.slice(0, 2)}-${memo.slice(2, 6)} ${memo.slice(6)}`;
        expect(normalizeMemo(lower ? typed.toLowerCase() : typed)).toBe(memo);
      }),
    );
  });
});
