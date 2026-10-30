import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createRequest,
  getRequest,
  makeApp,
  makeEngine,
  ORIGIN,
  prisma,
  requestBody,
  resetDb,
  setupMerchant,
  type TestApp,
  type TestEngine,
  type TestMerchant,
  type TestWallet,
} from "../helpers/harness";

let t: TestApp;
let e: TestEngine;
let merchant: TestMerchant;
let wallet: TestWallet;

beforeAll(() => {
  t = makeApp();
});
beforeEach(async () => {
  await resetDb();
  e = makeEngine();
  ({ merchant, wallet } = await setupMerchant(t));
  await e.ingestion.tick();
});
afterAll(async () => {
  await prisma.$disconnect();
});

const put = (body: object) => merchant.agent.put("/v1/pricing").set("Origin", ORIGIN).send(body);
const quote = (body: object) => merchant.agent.post("/v1/pricing/quote").set("Origin", ORIGIN).send(body);
const create = (body: Record<string, unknown>) =>
  merchant.agent.post("/v1/payment-requests").set("Origin", ORIGIN).send({ walletId: wallet.id, ...body });

describe("pricing settings", () => {
  it("starts MANUAL with no rate; a fixed rate can be set, made the default, and cleared", async () => {
    expect((await merchant.agent.get("/v1/pricing")).body.pricing).toEqual({ defaultMode: "MANUAL", fixedRate: null, rateUpdatedAt: null });
    const set = await put({ fixedRate: "18.50" });
    expect(set.status).toBe(200);
    expect(set.body.pricing).toMatchObject({ defaultMode: "MANUAL", fixedRate: "18.5000" });
    expect(set.body.pricing.rateUpdatedAt).toBeTruthy();
    expect((await put({ defaultMode: "FIXED_RATE" })).body.pricing).toMatchObject({ defaultMode: "FIXED_RATE", fixedRate: "18.5000" });
    // The rate can't be cleared while it is the default.
    const clear = await put({ fixedRate: null });
    expect(clear.status).toBe(400);
    expect(clear.body.error.code).toBe("RATE_NOT_SET");
    expect((await put({ defaultMode: "MANUAL", fixedRate: null })).body.pricing).toMatchObject({ defaultMode: "MANUAL", fixedRate: null });
    // /auth/me carries the same settings for the dashboard.
    expect((await merchant.agent.get("/auth/me")).body.merchant.pricing).toMatchObject({ defaultMode: "MANUAL", fixedRate: null });
  });

  it("Z6: FIXED_RATE can't be the default before a rate is set", async () => {
    const res = await put({ defaultMode: "FIXED_RATE" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("RATE_NOT_SET");
  });

  it("refuses rates outside R1 to R1,000 per USDC, more than 4 decimals, numbers and unknown fields", async () => {
    for (const bad of [{ fixedRate: "0.9999" }, { fixedRate: "1000.0001" }, { fixedRate: "18.50001" }, { fixedRate: 18.5 }, { fixedRate: "-18" }, { fixedRate: "18,50" }, { liveRate: true }, {}]) {
      const res = await put(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await put({ fixedRate: "1" })).status).toBe(200);
    expect((await put({ fixedRate: "1000" })).status).toBe(200);
  });
});

describe("ZAR requests", () => {
  it("Z1: MANUAL stores the ZAR and USDC amounts exactly as typed, with the implied rate for display", async () => {
    const res = await create({ zarAmount: "500.00", usdcAmount: "27.00" });
    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({
      zarAmount: "500.00",
      usdcAmount: "27.0000000",
      pricing: { mode: "MANUAL", rate: null, impliedRate: "18.5185" },
    });
    expect(await getRequest(res.body.request.id)).toMatchObject({ zarAmountCents: 50_000n, usdcAmountStroops: 270_000_000n, pricingMode: "MANUAL", rateSnapshot: null });
  });

  it("Z2: FIXED_RATE R500.00 at R18.50 asks for 27.03 USDC and freezes the rate on the request", async () => {
    await put({ fixedRate: "18.50" });
    const res = await create({ zarAmount: "500.00", pricingMode: "FIXED_RATE" });
    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({
      zarAmount: "500.00",
      usdcAmount: "27.0300000",
      usdcAmountStroops: "270300000",
      pricing: { mode: "FIXED_RATE", rate: "18.5000", impliedRate: null },
    });
  });

  it("Z3: FIXED_RATE R100.00 at R18.00 asks for 5.56 USDC, never 5.55", async () => {
    await put({ fixedRate: "18" });
    expect((await create({ zarAmount: "100", pricingMode: "FIXED_RATE" })).body.request.usdcAmount).toBe("5.5600000");
  });

  it("Z4: changing the rate later never changes an open request", async () => {
    await put({ fixedRate: "18.50", defaultMode: "FIXED_RATE" });
    const before = await createRequest(merchant, wallet, { zarAmount: "500.00", pricingMode: "FIXED_RATE" });
    expect(before.usdcAmount).toBe("27.0300000");
    await put({ fixedRate: "20.00" });
    const after = await createRequest(merchant, wallet, { zarAmount: "500.00", pricingMode: "FIXED_RATE" });
    expect(after.usdcAmount).toBe("25.0000000");
    const reread = (await merchant.agent.get(`/v1/payment-requests/${before.id}`)).body.request;
    expect(reread).toMatchObject({ usdcAmount: "27.0300000", pricing: { mode: "FIXED_RATE", rate: "18.5000" } });
    const page = (await request(t.app).get(`/public/pay/${before.publicId}`)).body;
    expect(page).toMatchObject({ zarAmount: "500.00", usdcAmount: "27.0300000", pricing: { rate: "18.5000" } });
  });

  it("Z6: FIXED_RATE with no rate set is 400 RATE_NOT_SET", async () => {
    const res = await create({ zarAmount: "100", pricingMode: "FIXED_RATE" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("RATE_NOT_SET");
    expect(await prisma.paymentRequest.count()).toBe(0);
  });

  it("Z7: a fixed-rate amount under 0.01 USDC is impossible (rounds up to 0.01); a manual one is AMOUNT_TOO_SMALL", async () => {
    await put({ fixedRate: "1000" });
    expect((await create({ zarAmount: "0.01", pricingMode: "FIXED_RATE" })).body.request.usdcAmount).toBe("0.0100000");
    const tiny = await create({ zarAmount: "0.01", usdcAmount: "0.001" });
    expect(tiny.status).toBe(400);
    expect(tiny.body.error.code).toBe("AMOUNT_TOO_SMALL");
  });

  it("Z8: FIXED_RATE with a usdcAmount is 400; MANUAL without one is 400", async () => {
    await put({ fixedRate: "18.50" });
    const both = await create({ zarAmount: "500", pricingMode: "FIXED_RATE", usdcAmount: "27" });
    expect(both.status).toBe(400);
    expect(both.body.error.code).toBe("VALIDATION_FAILED");
    const none = await create({ zarAmount: "500", pricingMode: "MANUAL" });
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe("VALIDATION_FAILED");
    expect((await create({ zarAmount: "500", pricingMode: "LIVE" })).status).toBe(400);
  });

  it("Z9: the quote preview equals the request that gets created", async () => {
    await put({ fixedRate: "18.50" });
    for (const zarAmount of ["500.00", "0.01", "1234.56", "1000000.00"]) {
      const q = await quote({ zarAmount, pricingMode: "FIXED_RATE" });
      expect(q.status).toBe(200);
      const made = await create({ zarAmount, pricingMode: "FIXED_RATE" });
      expect(made.body.request).toMatchObject({ zarAmount: q.body.zarAmount, usdcAmount: q.body.usdcAmount, pricing: q.body.pricing });
    }
    expect((await quote({ zarAmount: "500", usdcAmount: "27" })).body).toMatchObject({ usdcAmount: "27.0000000", pricing: { mode: "MANUAL", impliedRate: "18.5185" } });
    // Nothing is saved by a quote.
    const count = await prisma.paymentRequest.count();
    await quote({ zarAmount: "1", pricingMode: "FIXED_RATE" });
    expect(await prisma.paymentRequest.count()).toBe(count);
  });

  it("Z10: verification uses USDC only: the exact USDC amount pays the request whatever the ZAR says", async () => {
    await put({ fixedRate: "18.50" });
    const req = await createRequest(merchant, wallet, { zarAmount: "500.00", pricingMode: "FIXED_RATE" });
    // 27.00 USDC is R499.50 at the rate, and "500" in rand terms is not what is checked: still short.
    await e.pay({ to: wallet.address, amountStroops: 270_000_000n, memoRaw: req.reference });
    expect((await getRequest(req.id)).status).toBe("PARTIALLY_PAID");
    await e.pay({ to: wallet.address, amountStroops: 300_000n, memoRaw: req.reference });
    expect(await getRequest(req.id)).toMatchObject({ status: "PAID", receivedStroops: 270_300_000n, zarAmountCents: 50_000n });
  });

  it("the merchant's default mode applies when the request does not choose one", async () => {
    await put({ fixedRate: "18.50", defaultMode: "FIXED_RATE" });
    const res = await create({ zarAmount: "185" });
    expect(res.body.request).toMatchObject({ usdcAmount: "10.0000000", pricing: { mode: "FIXED_RATE" } });
    // The test helper's MANUAL body still works when it says so.
    expect((await create(requestBody(wallet, { pricingMode: "MANUAL" }))).status).toBe(201);
  });
});
