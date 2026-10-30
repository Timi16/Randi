import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sweepExpired } from "../../src/engine/expirySweeper";
import {
  createRequest,
  getPayment,
  getRequest,
  makeApp,
  makeEngine,
  ORIGIN,
  prisma,
  resetDb,
  setupMerchant,
  USDC,
  type TestApp,
  type TestEngine,
  type TestMerchant,
  type TestWallet,
} from "../helpers/harness";

let t: TestApp;
let e: TestEngine;
let merchant: TestMerchant;
let wallet: TestWallet;

const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);
const setExpiry = (id: string, expiresAt: Date) => prisma.paymentRequest.update({ where: { id }, data: { expiresAt } });
// Paylink had a merchant "Accept"; Randi does not, so this must always be 404.
const accept = (id: string) => merchant.agent.post(`/v1/payment-requests/${id}/accept`).set("Origin", ORIGIN).send();

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

describe("timing", () => {
  it("T1: a payment in a ledger before expiry but ingested after it is COUNTED -> PAID", async () => {
    const req = await createRequest(merchant, wallet);
    await setExpiry(req.id, ago(5 * MIN)); // expired 5 minutes ago by the clock
    // The ledger closed 6 minutes ago (before expiry); the worker was down and sees it only now.
    e.source.closeLedger(ago(6 * MIN), [{ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference }]);
    expect(await sweepExpired(prisma)).toBe(0); // the sweeper must not jump ahead of ingestion
    await e.ingestion.tick();
    expect(await getRequest(req.id)).toMatchObject({ status: "PAID", receivedStroops: USDC(50) });
    expect(await sweepExpired(prisma)).toBe(0);
  });

  it("T2: a payment in a ledger after expiry is LATE and the request EXPIRED; it is never marked paid", async () => {
    const req = await createRequest(merchant, wallet);
    await setExpiry(req.id, ago(5 * MIN));
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference }, ago(1 * MIN));
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "LATE", requestId: req.id });
    expect(await getRequest(req.id)).toMatchObject({ status: "EXPIRED", receivedStroops: 0n, paidTxHash: null });
    // The money arrived, so the merchant owes it back.
    expect((await merchant.agent.get(`/v1/payment-requests/${req.id}`)).body.request).toMatchObject({ status: "EXPIRED", refundOwed: true });
    const audit = await prisma.requestEvent.findMany({ where: { requestId: req.id, NOT: { reason: "created" } }, orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => [a.toStatus, a.reason, a.actor])).toEqual([["EXPIRED", "expired", "system"]]);
    // EXPIRED is final: no endpoint turns it into PAID.
    expect((await accept(req.id)).status).toBe(404);
    expect((await getRequest(req.id)).status).toBe("EXPIRED");
  });

  it("T2: a second late payment after the sweeper expired the request is LATE too", async () => {
    const req = await createRequest(merchant, wallet);
    await setExpiry(req.id, ago(5 * MIN));
    e.source.closeLedger(ago(2 * MIN));
    await e.ingestion.tick();
    expect(await sweepExpired(prisma)).toBe(1);
    const [a] = await e.pay({ to: wallet.address, amountStroops: USDC(30), memoRaw: req.reference }, ago(1 * MIN));
    const [b] = await e.pay({ to: wallet.address, amountStroops: USDC(20), memoRaw: req.reference });
    expect((await getPayment(a!.eventId)).outcome).toBe("LATE");
    expect((await getPayment(b!.eventId)).outcome).toBe("LATE");
    expect(await getRequest(req.id)).toMatchObject({ status: "EXPIRED", receivedStroops: 0n });
    const detail = (await merchant.agent.get(`/v1/payment-requests/${req.id}`)).body.request;
    expect(detail).toMatchObject({ refundOwed: true, refundDue: [{ amount: "50.0000000" }] });
  });

  it("T3: a partial payment followed by expiry is EXPIRED with the received amount and a refund flag", async () => {
    const req = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(20), memoRaw: req.reference }, ago(10 * MIN));
    await setExpiry(req.id, ago(5 * MIN));
    e.source.closeLedger(ago(1 * MIN));
    await e.ingestion.tick();
    expect(await sweepExpired(prisma)).toBe(1);
    const detail = await merchant.agent.get(`/v1/payment-requests/${req.id}`);
    expect(detail.body.request).toMatchObject({ status: "EXPIRED", usdcReceived: "20.0000000", refundOwed: true, paidTxHash: null });
  });

  it("T4: a part-paid request stays PARTIALLY_PAID until the rest arrives; it cannot be cancelled or accepted", async () => {
    const req = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(48), memoRaw: req.reference });
    expect((await accept(req.id)).status).toBe(404);
    expect((await merchant.agent.post(`/v1/payment-requests/${req.id}/cancel`).set("Origin", ORIGIN).send()).status).toBe(409);
    expect(await getRequest(req.id)).toMatchObject({ status: "PARTIALLY_PAID", receivedStroops: USDC(48), paidTxHash: null });
  });

  it("T4: a payment after cancel is AFTER_CANCEL; the request stays CANCELLED with a refund owed", async () => {
    const req = await createRequest(merchant, wallet);
    const cancel = await merchant.agent.post(`/v1/payment-requests/${req.id}/cancel`).set("Origin", ORIGIN).send();
    expect(cancel.body.request).toMatchObject({ status: "CANCELLED" });
    expect(cancel.body.request.cancelledAt).toBeTruthy();
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "AFTER_CANCEL", requestId: req.id });
    expect(await getRequest(req.id)).toMatchObject({ status: "CANCELLED", receivedStroops: 0n });
    // Nothing was counted, but the customer's money did arrive: the merchant owes it back.
    const detail = await merchant.agent.get(`/v1/payment-requests/${req.id}`);
    expect(detail.body.request).toMatchObject({ status: "CANCELLED", usdcReceived: "0.0000000", refundOwed: true });
    // The payment page tells the customer the truth.
    const pub = await merchant.agent.get(`/public/pay/${req.publicId}`);
    expect(pub.body).toMatchObject({ status: "CANCELLED", paidTxHash: null });
  });

  it("T4: only a PENDING request can be cancelled", async () => {
    const req = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(10), memoRaw: req.reference });
    const underpaid = await merchant.agent.post(`/v1/payment-requests/${req.id}/cancel`).set("Origin", ORIGIN).send();
    expect(underpaid.status).toBe(409);
    expect(underpaid.body.error.code).toBe("INVALID_TRANSITION");
    await e.pay({ to: wallet.address, amountStroops: USDC(40), memoRaw: req.reference });
    const paid = await merchant.agent.post(`/v1/payment-requests/${req.id}/cancel`).set("Origin", ORIGIN).send();
    expect(paid.status).toBe(409);
    expect((await getRequest(req.id)).status).toBe("PAID");
  });

  it("T5: with ingestion 3 minutes behind at expiry, nothing expires until the processed ledger passes expiresAt", async () => {
    const req = await createRequest(merchant, wallet);
    await setExpiry(req.id, ago(1 * MIN));
    // Last processed ledger closed 3 minutes ago: the worker is behind.
    e.source.closeLedger(ago(3 * MIN));
    await e.ingestion.tick();
    expect(await sweepExpired(prisma)).toBe(0);
    expect((await getRequest(req.id)).status).toBe("PENDING");
    // Ingestion catches up past expiresAt: now it may expire.
    e.source.closeLedger(ago(1000));
    await e.ingestion.tick();
    expect(await sweepExpired(prisma)).toBe(1);
    expect((await getRequest(req.id)).status).toBe("EXPIRED");
    const audit = await prisma.requestEvent.findMany({ where: { requestId: req.id, NOT: { reason: "created" } } });
    expect(audit).toMatchObject([{ fromStatus: "PENDING", toStatus: "EXPIRED", reason: "expired", actor: "system" }]);
  });

  it("T5: before any ledger has been processed there is no safe cutoff, so nothing expires", async () => {
    await prisma.cursor.deleteMany();
    const req = await createRequest(merchant, wallet);
    await setExpiry(req.id, ago(60 * MIN));
    expect(await sweepExpired(prisma)).toBe(0);
    expect((await getRequest(req.id)).status).toBe("PENDING");
  });

  it("T6: server clock skew cannot expire a request: ledger time decides", async () => {
    const req = await createRequest(merchant, wallet); // expires in 30 minutes
    e.source.closeLedger(new Date());
    await e.ingestion.tick();
    // The server clock is a day fast. The last processed ledger is still before expiresAt.
    const fastClock = new Date(Date.now() + 24 * 60 * MIN);
    expect(await sweepExpired(prisma, fastClock)).toBe(0);
    // A payment whose ledger closed before expiry counts, whatever the server clock says.
    await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference });
    expect((await getRequest(req.id)).status).toBe("PAID");

    // The server clock is a day slow while the chain is past expiry: the clock half of the
    // rule holds expiry back, but a payment in a ledger after expiresAt is still LATE.
    const second = await createRequest(merchant, wallet);
    await setExpiry(second.id, ago(2 * MIN));
    e.source.closeLedger(ago(1 * MIN));
    await e.ingestion.tick();
    expect(await sweepExpired(prisma, new Date(Date.now() - 24 * 60 * MIN))).toBe(0);
    const [late] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: second.reference });
    expect((await getPayment(late!.eventId)).outcome).toBe("LATE");
    expect((await getRequest(second.id)).status).toBe("EXPIRED");
  });

  it("T7: expiry outside 5 minutes to 30 days is 400 VALIDATION_FAILED", async () => {
    const create = (expiresInMinutes: unknown) =>
      merchant.agent.post("/v1/payment-requests").set("Origin", ORIGIN).send({ walletId: wallet.id, zarAmount: "925.00", usdcAmount: "50", expiresInMinutes });
    for (const bad of [4, 0, -5, 43_201, 5.5, "30"]) {
      const res = await create(bad);
      expect(res.status, String(bad)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
    expect((await create(5)).status).toBe(201);
    const max = await create(43_200);
    expect(max.status).toBe(201);
    const days = (new Date(max.body.request.expiresAt).getTime() - Date.now()) / (24 * 60 * MIN);
    expect(days).toBeGreaterThan(29.99);
    // Default is 30 minutes.
    const def = await merchant.agent.post("/v1/payment-requests").set("Origin", ORIGIN).send({ walletId: wallet.id, zarAmount: "925.00", usdcAmount: "50" });
    const mins = (new Date(def.body.request.expiresAt).getTime() - Date.now()) / MIN;
    expect(mins).toBeGreaterThan(29.9);
    expect(mins).toBeLessThanOrEqual(30);
  });

  it("the sweeper and a payment racing on the same request leave one consistent result", async () => {
    const req = await createRequest(merchant, wallet);
    await setExpiry(req.id, ago(2 * MIN));
    e.source.closeLedger(ago(1 * MIN));
    await e.ingestion.tick();
    // A payment whose ledger closed before expiry arrives late through reconciliation.
    const made = e.source.closeLedger(ago(3 * MIN), [{ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference }]);
    await Promise.all([sweepExpired(prisma), e.ingestion.tick()]);
    const row = await getRequest(req.id);
    const payment = await getPayment(made[0]!.eventId);
    // Either the payment won (PAID/COUNTED) or the sweeper did (EXPIRED/LATE). Never a mix.
    expect([`${row.status}/${payment.outcome}`]).toContain(
      row.status === "PAID" ? "PAID/COUNTED" : "EXPIRED/LATE",
    );
    expect(row.receivedStroops).toBe(row.status === "PAID" ? USDC(50) : 0n);
  });
});
