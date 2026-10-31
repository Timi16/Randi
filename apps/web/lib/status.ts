import type { ChainPayment, PaymentOutcome, PaymentRequest, RequestStatus } from "./types";

export type Tone = "good" | "warn" | "muted" | "danger" | "neutral";
export type IconName = "check" | "clock" | "alert" | "cross" | "dash" | "half";

interface PillSpec {
  label: string;
  tone: Tone;
  icon: IconName;
}

export const REQUEST_STATUS: Record<RequestStatus, PillSpec> = {
  PENDING: { label: "Pending", tone: "warn", icon: "clock" },
  PARTIALLY_PAID: { label: "Part-paid", tone: "warn", icon: "half" },
  PAID: { label: "Paid", tone: "good", icon: "check" },
  OVERPAID: { label: "Paid · extra", tone: "good", icon: "check" },
  EXPIRED: { label: "Expired", tone: "muted", icon: "dash" },
  CANCELLED: { label: "Cancelled", tone: "muted", icon: "cross" },
  FAILED: { label: "Failed", tone: "danger", icon: "alert" },
};

/** How each payment outcome is worded for a merchant, and what to do about it. */
export const PAYMENT_OUTCOME: Record<PaymentOutcome, PillSpec & { explain: string }> = {
  COUNTED: { label: "Applied", tone: "good", icon: "check", explain: "Counted toward the request." },
  DUPLICATE: { label: "Paid twice", tone: "warn", icon: "alert", explain: "The request was already paid. Send this one back." },
  LATE: { label: "Arrived late", tone: "warn", icon: "alert", explain: "It arrived after the request expired. Send it back." },
  AFTER_CANCEL: { label: "After cancel", tone: "warn", icon: "alert", explain: "It arrived after you cancelled. Send it back." },
  AFTER_CLOSE: { label: "After close", tone: "warn", icon: "alert", explain: "It arrived after the request closed. Send it back." },
  WRONG_ASSET: { label: "Wrong asset", tone: "danger", icon: "cross", explain: "Right reference, but not USDC. It doesn't count." },
  WRONG_ISSUER: { label: "Fake USDC", tone: "danger", icon: "cross", explain: "Called USDC, but from another issuer. It doesn't count." },
  WRONG_WALLET: { label: "Wrong wallet", tone: "danger", icon: "cross", explain: "The reference belongs to a request on another wallet." },
  NO_MEMO: { label: "No reference", tone: "warn", icon: "alert", explain: "No memo, so it couldn't be matched. Link it to a request." },
  UNKNOWN_MEMO: { label: "Unknown reference", tone: "warn", icon: "alert", explain: "The memo doesn't match any request. Link it to one." },
  MEMO_TYPE_MISMATCH: { label: "Wrong memo type", tone: "warn", icon: "alert", explain: "The memo was a number or hash, not the text reference." },
};

export const OPEN_STATUSES: RequestStatus[] = ["PENDING", "PARTIALLY_PAID"];
export const isOpen = (status: RequestStatus) => OPEN_STATUSES.includes(status);
export const isSettled = (status: RequestStatus) => status === "PAID" || status === "OVERPAID";

export const REJECTED_OUTCOMES: PaymentOutcome[] = ["WRONG_ASSET", "WRONG_ISSUER", "WRONG_WALLET"];
export const REFUNDABLE_OUTCOMES: PaymentOutcome[] = ["DUPLICATE", "LATE", "AFTER_CANCEL", "AFTER_CLOSE", "WRONG_ASSET", "WRONG_ISSUER"];

/** What to call a request in lists: the description, else the order number, else the reference. */
export function requestTitle(r: Pick<PaymentRequest, "customerRef" | "description" | "reference">): string {
  return r.description || r.customerRef || r.reference;
}

/** The secondary line under the title. */
export function requestSubtitle(r: Pick<PaymentRequest, "customerRef" | "description" | "reference">): string {
  return r.description && r.customerRef ? `#${r.customerRef.replace(/^#/, "")}` : r.reference;
}

export const isUnmatched = (p: Pick<ChainPayment, "outcome" | "requestId">) =>
  p.requestId === null && (p.outcome === "NO_MEMO" || p.outcome === "UNKNOWN_MEMO" || p.outcome === "MEMO_TYPE_MISMATCH");

/** A payment the merchant still owes back. */
export const owesRefund = (p: Pick<ChainPayment, "outcome" | "refundedAt">) => p.refundedAt === null && REFUNDABLE_OUTCOMES.includes(p.outcome);

/** One-line reason a request needs the merchant's attention, or null. */
export function attentionReason(r: PaymentRequest): string | null {
  if (r.refundOwed && !r.refundedAt) {
    const due = r.refundDue.find((d) => d.amountStroops !== "0");
    return due ? `Send back ${due.amount.replace(/\.?0+$/, "")} ${due.asset.code}` : "A refund is owed";
  }
  if (r.status === "PARTIALLY_PAID") return `${r.usdcRemaining.replace(/\.?0+$/, "")} USDC still due`;
  return null;
}
