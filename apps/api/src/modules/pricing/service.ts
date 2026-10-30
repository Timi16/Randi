import type { Merchant } from "@prisma/client";
import type { PricingSettings, Quote, QuoteBody, UpdatePricingBody } from "@randi/shared";
import type { AppDeps } from "../../deps";
import { formatRate, formatStroops, formatZar, impliedRate, parseRate } from "../../lib/amount";
import { AppError, notFound } from "../../lib/errors";
import { priceRequest, type PricedAmounts } from "../../lib/pricing";

export function serializePricing(m: Pick<Merchant, "defaultPricingMode" | "fixedRate" | "rateUpdatedAt">): PricingSettings {
  return {
    defaultMode: m.defaultPricingMode,
    fixedRate: m.fixedRate === null ? null : formatRate(m.fixedRate),
    rateUpdatedAt: m.rateUpdatedAt?.toISOString() ?? null,
  };
}

/** How a request's USDC amount was set, for the merchant and the customer. */
export function pricingView(p: Pick<PricedAmounts, "zarAmountCents" | "usdcAmountStroops" | "pricingMode" | "rateSnapshot">) {
  const implied = p.pricingMode === "MANUAL" ? impliedRate(p.zarAmountCents, p.usdcAmountStroops) : null;
  return {
    mode: p.pricingMode,
    rate: p.rateSnapshot === null ? null : formatRate(p.rateSnapshot),
    impliedRate: implied === null ? null : formatRate(implied),
  };
}

export function createPricingService(deps: AppDeps) {
  const { prisma } = deps;

  async function merchantOf(merchantId: string): Promise<Merchant> {
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw notFound("Merchant");
    return merchant;
  }

  return {
    async get(merchantId: string): Promise<PricingSettings> {
      return serializePricing(await merchantOf(merchantId));
    },

    /**
     * Changes the merchant's pricing defaults. A new rate applies to new requests only: every
     * request keeps the rate it was created with.
     */
    async update(merchantId: string, body: UpdatePricingBody): Promise<PricingSettings> {
      const current = await merchantOf(merchantId);
      const fixedRate = body.fixedRate === undefined ? current.fixedRate : body.fixedRate === null ? null : parseRate(body.fixedRate);
      const defaultMode = body.defaultMode ?? current.defaultPricingMode;
      if (defaultMode === "FIXED_RATE" && fixedRate === null) {
        throw new AppError("RATE_NOT_SET", "Set a fixed rate before making it the default");
      }
      const rateChanged = body.fixedRate !== undefined && fixedRate !== current.fixedRate;
      const updated = await prisma.merchant.update({
        where: { id: merchantId },
        data: {
          defaultPricingMode: defaultMode,
          fixedRate,
          ...(rateChanged ? { rateUpdatedAt: new Date() } : {}),
        },
      });
      return serializePricing(updated);
    },

    /** Preview for the new-request form. Same function as create, nothing saved. */
    async quote(merchantId: string, body: QuoteBody): Promise<Quote> {
      const priced = priceRequest(await merchantOf(merchantId), body);
      return {
        zarAmount: formatZar(priced.zarAmountCents),
        usdcAmount: formatStroops(priced.usdcAmountStroops),
        usdcAmountStroops: priced.usdcAmountStroops.toString(),
        pricing: pricingView(priced),
      };
    },
  };
}

export type PricingService = ReturnType<typeof createPricingService>;
