import { z } from "zod";
import { MAX_RATE_UNITS, MAX_ZAR_CENTS, MIN_RATE_UNITS, parseRate, parseZar } from "../amount";
import { AmountSchema } from "./common";

export const PRICING_MODES = ["MANUAL", "FIXED_RATE"] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

/** Rand as a decimal string with at most 2 decimals, R0.01 to R1,000,000.00. */
export const ZarAmountSchema = z
  .string()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, "ZAR amount must be a decimal string with at most 2 decimals")
  .refine((v) => {
    const cents = parseZar(v);
    return cents !== null && cents > 0n && cents <= MAX_ZAR_CENTS;
  }, "ZAR amount must be more than 0 and at most 1000000.00");

/** ZAR per 1 USDC, at most 4 decimals, 1 to 1000. */
export const RateSchema = z
  .string()
  .regex(/^\d{1,4}(\.\d{1,4})?$/, "Rate must be a decimal string with at most 4 decimals")
  .refine((v) => {
    const units = parseRate(v);
    return units !== null && units >= MIN_RATE_UNITS && units <= MAX_RATE_UNITS;
  }, "Rate must be between 1 and 1000 rand per USDC");

export const PricingSettingsSchema = z.object({
  defaultMode: z.enum(PRICING_MODES),
  /** ZAR per 1 USDC set by the merchant; null until set. Never a live exchange rate. */
  fixedRate: z.string().nullable(),
  rateUpdatedAt: z.string().nullable(),
});
export type PricingSettings = z.infer<typeof PricingSettingsSchema>;
export const PricingResponse = z.object({ pricing: PricingSettingsSchema });

export const UpdatePricingBody = z
  .object({
    defaultMode: z.enum(PRICING_MODES),
    /** null clears the rate (only allowed while the default mode is MANUAL). */
    fixedRate: RateSchema.nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Send at least one setting to change");
export type UpdatePricingBody = z.infer<typeof UpdatePricingBody>;

/** The ZAR / USDC part of a new request; shared by the quote preview and create. */
export const PricingInput = {
  zarAmount: ZarAmountSchema,
  /** Defaults to the merchant's default mode. */
  pricingMode: z.enum(PRICING_MODES).optional(),
  /** MANUAL only: the USDC the customer must send. Not allowed with FIXED_RATE. */
  usdcAmount: AmountSchema.optional(),
};

export const QuoteBody = z.object(PricingInput).strict();
export type QuoteBody = z.infer<typeof QuoteBody>;

/** How a request's USDC amount was set, as shown to merchant and customer. */
export const PricingSchema = z.object({
  mode: z.enum(PRICING_MODES),
  /** FIXED_RATE: the merchant's rate at creation. null for MANUAL. */
  rate: z.string().nullable(),
  /** MANUAL: the rate the two amounts imply, for display only. null for FIXED_RATE. */
  impliedRate: z.string().nullable(),
});

export const QuoteResponse = z.object({
  zarAmount: z.string(),
  usdcAmount: z.string(),
  usdcAmountStroops: z.string(),
  pricing: PricingSchema,
});
export type Quote = z.infer<typeof QuoteResponse>;
