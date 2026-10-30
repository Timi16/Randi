import type { PricingMode } from "@prisma/client";
import { AppError } from "./errors";
import { MIN_USDC_STROOPS, parseAmount, parseZar, usdcForZar } from "./amount";

export interface PricingRequest {
  zarAmount: string;
  pricingMode?: PricingMode;
  usdcAmount?: string;
}

export interface PricingMerchant {
  defaultPricingMode: PricingMode;
  fixedRate: bigint | null;
}

export interface PricedAmounts {
  zarAmountCents: bigint;
  usdcAmountStroops: bigint;
  pricingMode: PricingMode;
  /** FIXED_RATE: the rate used, frozen on the request. null for MANUAL. */
  rateSnapshot: bigint | null;
}

/**
 * Works out a request's USDC amount from its ZAR amount. The quote preview and request
 * creation both call this, so what the merchant previews is exactly what gets saved.
 * Randi never fetches a rate: FIXED_RATE uses the merchant's own number, MANUAL takes the
 * USDC amount as typed.
 */
export function priceRequest(merchant: PricingMerchant, input: PricingRequest): PricedAmounts {
  const zarAmountCents = parseZar(input.zarAmount);
  if (zarAmountCents === null || zarAmountCents <= 0n) {
    throw new AppError("VALIDATION_FAILED", "Invalid ZAR amount");
  }
  const pricingMode = input.pricingMode ?? merchant.defaultPricingMode;

  if (pricingMode === "FIXED_RATE") {
    if (input.usdcAmount !== undefined) {
      throw new AppError("VALIDATION_FAILED", "With a fixed rate, Randi calculates the USDC amount; don't send usdcAmount", {
        details: [{ path: ["usdcAmount"], message: "Not allowed with FIXED_RATE" }],
      });
    }
    if (merchant.fixedRate === null) {
      throw new AppError("RATE_NOT_SET", "Set a fixed rate in Settings before pricing requests with it");
    }
    const usdcAmountStroops = usdcForZar(zarAmountCents, merchant.fixedRate);
    if (usdcAmountStroops < MIN_USDC_STROOPS) {
      throw new AppError("AMOUNT_TOO_SMALL", "That comes to less than 0.01 USDC");
    }
    return { zarAmountCents, usdcAmountStroops, pricingMode, rateSnapshot: merchant.fixedRate };
  }

  if (input.usdcAmount === undefined) {
    throw new AppError("VALIDATION_FAILED", "Enter the USDC amount the customer must send", {
      details: [{ path: ["usdcAmount"], message: "Required with MANUAL pricing" }],
    });
  }
  const usdcAmountStroops = parseAmount(input.usdcAmount);
  if (usdcAmountStroops === null || usdcAmountStroops <= 0n) {
    throw new AppError("VALIDATION_FAILED", "Invalid USDC amount");
  }
  if (usdcAmountStroops < MIN_USDC_STROOPS) {
    throw new AppError("AMOUNT_TOO_SMALL", "A request must ask for at least 0.01 USDC");
  }
  return { zarAmountCents, usdcAmountStroops, pricingMode, rateSnapshot: null };
}
