import { z } from "zod";
import { AssetSchema, CANNOT_RECEIVE_REASONS, REQUEST_STATUSES } from "./common";
import { PricingSchema } from "./pricing";

export const PublicIdParamsSchema = z
  .object({ publicId: z.string().regex(/^[A-Za-z0-9]{12}$/, "Invalid payment link") })
  .strict();

/** Everything the public payment page may see. Nothing else about the merchant leaves the API. */
export const CheckoutSchema = z.object({
  /** The request ID (same as in the link). */
  requestId: z.string(),
  businessName: z.string(),
  /** How to reach the business, if they set one. */
  supportContact: z.string().nullable(),
  /** Always "Stellar Testnet": test money only, no real value. */
  network: z.literal("Stellar Testnet"),
  /** What the merchant charges, in rand. Display only. */
  zarAmount: z.string(),
  /** The USDC to send: the only amount that is verified. */
  usdcAmount: z.string(),
  usdcReceived: z.string(),
  usdcRemaining: z.string(),
  pricing: PricingSchema,
  asset: AssetSchema,
  wallet: z.string(),
  /** The business proved it controls this wallet by signing a challenge with it. */
  walletVerified: z.boolean(),
  /** The payment reference: put it in the memo field. */
  reference: z.string(),
  memoId: z.string(),
  muxedAddress: z.string(),
  description: z.string().nullable(),
  customerRef: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  expiresAt: z.string(),
  paidTxHash: z.string().nullable(),
  /** Ledger close time of the payment that completed it. */
  paidAt: z.string().nullable(),
  /** Block explorer link for paidTxHash. */
  explorerUrl: z.string().nullable(),
  canReceive: z.boolean(),
  cannotReceiveReason: z.enum(CANNOT_RECEIVE_REASONS).nullable(),
  /** Payments with this reference that were rejected (wrong asset or counterfeit), so the page can say so. */
  rejectedPayments: z.array(z.object({ outcome: z.string(), asset: AssetSchema, amount: z.string(), txHash: z.string() })),
  sep7Uri: z.string(),
});
export type Checkout = z.infer<typeof CheckoutSchema>;

/** Payload of the public SSE `status` event. */
export const CheckoutStatusSchema = z.object({
  status: z.enum(REQUEST_STATUSES),
  usdcReceived: z.string(),
  usdcRemaining: z.string(),
  paidTxHash: z.string().nullable(),
  paidAt: z.string().nullable(),
  expiresAt: z.string(),
});
export type CheckoutStatus = z.infer<typeof CheckoutStatusSchema>;

export const HealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["up", "down"]),
  network: z.literal("testnet"),
  lastProcessedLedger: z.number().nullable(),
  lagSeconds: z.number().nullable(),
  openRequests: z.number().nullable(),
});
export type Health = z.infer<typeof HealthSchema>;
