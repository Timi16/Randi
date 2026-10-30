import { Router } from "express";
import { QuoteBody, UpdatePricingBody } from "@randi/shared";
import { authOf } from "../../middleware/auth";
import { parse } from "../../middleware/validate";
import type { PricingService } from "./service";

export function pricingRoutes(service: PricingService): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    res.json({ pricing: await service.get(authOf(req).merchantId) });
  });

  router.put("/", async (req, res) => {
    const body = parse(UpdatePricingBody, req.body);
    res.json({ pricing: await service.update(authOf(req).merchantId, body) });
  });

  router.post("/quote", async (req, res) => {
    const body = parse(QuoteBody, req.body);
    res.json(await service.quote(authOf(req).merchantId, body));
  });

  return router;
}
