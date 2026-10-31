import { REQUEST_STATUSES, PAYMENT_OUTCOMES } from "@randi/shared";
import { describe, expect, it } from "vitest";
import { isOpen, isSettled, isUnmatched, owesRefund, PAYMENT_OUTCOME, REQUEST_STATUS } from "@/lib/status";

describe("status labels", () => {
  it("covers every status and outcome the API can return, each with an icon and a word", () => {
    for (const s of REQUEST_STATUSES) {
      expect(REQUEST_STATUS[s].label.length).toBeGreaterThan(0);
      expect(REQUEST_STATUS[s].icon).toBeTruthy();
    }
    for (const o of PAYMENT_OUTCOMES) {
      expect(PAYMENT_OUTCOME[o].label.length).toBeGreaterThan(0);
      expect(PAYMENT_OUTCOME[o].explain.length).toBeGreaterThan(0);
    }
  });

  it("uses green only for paid states", () => {
    const green = REQUEST_STATUSES.filter((s) => REQUEST_STATUS[s].tone === "good");
    expect(green.sort()).toEqual(["OVERPAID", "PAID"]);
  });

  it("knows which requests are open or settled", () => {
    expect(isOpen("PENDING")).toBe(true);
    expect(isOpen("PARTIALLY_PAID")).toBe(true);
    expect(isOpen("EXPIRED")).toBe(false);
    expect(isSettled("OVERPAID")).toBe(true);
    expect(isSettled("CANCELLED")).toBe(false);
  });

  it("finds unmatched payments and refunds still owed", () => {
    expect(isUnmatched({ outcome: "NO_MEMO", requestId: null })).toBe(true);
    expect(isUnmatched({ outcome: "COUNTED", requestId: "r1" })).toBe(false);
    expect(owesRefund({ outcome: "DUPLICATE", refundedAt: null })).toBe(true);
    expect(owesRefund({ outcome: "DUPLICATE", refundedAt: "2026-10-31T12:00:00Z" })).toBe(false);
    expect(owesRefund({ outcome: "COUNTED", refundedAt: null })).toBe(false);
  });
});
