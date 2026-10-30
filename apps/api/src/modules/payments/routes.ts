import { Router } from "express";
import { EventIdParamsSchema, LinkPaymentBody, ListPaymentsQuery, MarkRefundedBody } from "@randi/shared";
import { authOf } from "../../middleware/auth";
import { parse } from "../../middleware/validate";
import type { PrismaClient } from "@prisma/client";
import { presentRequest, serializePayment } from "../requests/serialize";
import type { PaymentService } from "./service";

export function paymentRoutes(service: PaymentService, prisma: PrismaClient): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const merchantId = authOf(req).merchantId;
    const query = parse(ListPaymentsQuery, req.query);
    const { data, suggestions, nextCursor } = await service.list(merchantId, query);
    res.json({
      data: data.map((p) =>
        serializePayment(p, {
          showRequestId: !p.request || p.request.merchantId === merchantId,
          suggestedRequestId: suggestions.get(p.eventId) ?? null,
        }),
      ),
      nextCursor,
    });
  });

  router.post("/:eventId/link", async (req, res) => {
    const { eventId } = parse(EventIdParamsSchema, req.params);
    const { requestId } = parse(LinkPaymentBody, req.body);
    const { payment, request } = await service.link(authOf(req).merchantId, eventId, requestId);
    res.json({ payment: serializePayment(payment), request: await presentRequest(prisma, request) });
  });

  router.post("/:eventId/refunded", async (req, res) => {
    const { eventId } = parse(EventIdParamsSchema, req.params);
    const { txHash } = parse(MarkRefundedBody, req.body ?? {});
    res.json({ payment: serializePayment(await service.markRefunded(authOf(req).merchantId, eventId, txHash)) });
  });

  return router;
}
