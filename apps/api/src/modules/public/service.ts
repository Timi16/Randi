import type { Checkout } from "@randi/shared";
import { env } from "../../config/env";
import type { AppDeps } from "../../deps";
import { formatStroops, formatZar } from "../../lib/amount";
import { notFound } from "../../lib/errors";
import { RESET_EVENT_PREFIX } from "../../engine/networkReset";
import { pricingView } from "../pricing/service";
import { NETWORK_NAME, numericReference, remainingStroops } from "../requests/serialize";
import { OPEN_STATUSES } from "../transitions";
import { checkCanReceive } from "../wallets/capability";
import type { WalletService } from "../wallets/service";

const CHECKOUT_WALLET_MAX_AGE_MS = 30_000;

/** Testnet block explorer link for a transaction. */
export function explorerUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

/** SEP-7 pay URI for the QR code and "open in wallet" links. */
export function sep7Uri(r: {
  walletAddress: string;
  assetCode: string;
  assetIssuer: string;
  memo: string;
  amountStroops: bigint;
}): string {
  const params = new URLSearchParams();
  params.set("destination", r.walletAddress);
  params.set("amount", formatStroops(r.amountStroops));
  params.set("asset_code", r.assetCode);
  params.set("asset_issuer", r.assetIssuer);
  params.set("memo", r.memo);
  params.set("memo_type", "MEMO_TEXT");
  params.set("network_passphrase", env.NETWORK_PASSPHRASE);
  // SEP-7 wants percent-encoding (%20), not form encoding (+).
  return `web+stellar:pay?${params.toString().replace(/\+/g, "%20")}`;
}

export function createPublicService(deps: AppDeps, wallets: WalletService) {
  const { prisma } = deps;
  return {
    async findRequest(publicId: string) {
      const request = await prisma.paymentRequest.findUnique({ where: { publicId } });
      if (!request) throw notFound("Payment request");
      return request;
    },

    /** Only the fields the security checklist allows on a public page. */
    async checkout(publicId: string): Promise<Checkout> {
      const request = await prisma.paymentRequest.findUnique({
        where: { publicId },
        include: { merchant: { select: { businessName: true, supportContact: true } }, wallet: true },
      });
      if (!request) throw notFound("Payment request");

      const remaining = remainingStroops(request);
      const open = OPEN_STATUSES.includes(request.status);
      let canReceive = true;
      let reason: Checkout["cannotReceiveReason"] = null;
      if (open) {
        // Re-check the wallet on checkout load (cached 30 s) so the payer is warned before
        // sending money the wallet cannot accept. Never fails the page if Horizon is down.
        const wallet = await wallets
          .ensureFresh(request.wallet, CHECKOUT_WALLET_MAX_AGE_MS)
          .catch(() => request.wallet);
        const check = checkCanReceive(
          wallet,
          { code: request.assetCode, issuer: request.assetIssuer },
          remaining,
        );
        if (!check.ok) {
          canReceive = false;
          reason = check.reason;
        }
      }

      // Payments sent with this reference in the wrong asset, so the customer is told they were not applied.
      const rejected = await prisma.chainPayment.findMany({
        where: {
          requestId: request.id,
          outcome: { in: ["WRONG_ASSET", "WRONG_ISSUER"] },
          NOT: { eventId: { startsWith: RESET_EVENT_PREFIX } },
        },
        orderBy: [{ ledger: "asc" }, { eventId: "asc" }],
        select: { outcome: true, assetCode: true, assetIssuer: true, amountStroops: true, txHash: true },
        take: 20,
      });

      return {
        requestId: request.publicId,
        businessName: request.merchant.businessName,
        supportContact: request.merchant.supportContact,
        network: NETWORK_NAME,
        zarAmount: formatZar(request.zarAmountCents),
        usdcAmount: formatStroops(request.usdcAmountStroops),
        usdcReceived: formatStroops(request.receivedStroops),
        usdcRemaining: formatStroops(remaining),
        pricing: pricingView(request),
        asset: { code: request.assetCode, issuer: request.assetIssuer },
        wallet: request.walletAddress,
        walletVerified: request.wallet.verifiedAt !== null,
        reference: request.memo,
        ...numericReference(request),
        description: request.description,
        customerRef: request.customerRef,
        status: request.status,
        expiresAt: request.expiresAt.toISOString(),
        paidTxHash: request.paidTxHash,
        paidAt: request.paidAt?.toISOString() ?? null,
        explorerUrl: request.paidTxHash ? explorerUrl(request.paidTxHash) : null,
        canReceive,
        cannotReceiveReason: reason,
        rejectedPayments: rejected.map((p) => ({
          outcome: p.outcome,
          asset: { code: p.assetCode, issuer: p.assetIssuer },
          amount: formatStroops(p.amountStroops),
          txHash: p.txHash,
        })),
        sep7Uri: sep7Uri({ ...request, amountStroops: remaining > 0n ? remaining : request.usdcAmountStroops }),
      };
    },
  };
}

export type PublicService = ReturnType<typeof createPublicService>;
