import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { processPayment } from "../../src/engine/matcher";
import { FAKE_ISSUER, PAYER, USDC_ISSUER } from "../helpers/fakes";
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

beforeAll(() => {
  t = makeApp();
});
beforeEach(async () => {
  await resetDb();
  e = makeEngine();
  ({ merchant, wallet } = await setupMerchant(t));
  await e.ingestion.tick(); // initialise the cursor at the tip
});
afterAll(async () => {
  await prisma.$disconnect();
});

const events = (requestId: string) =>
  prisma.requestEvent.findMany({ where: { requestId, NOT: { reason: "created" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

describe("matching", () => {
  it("P1: right wallet, asset, issuer, amount and memo before expiry is COUNTED -> PAID with the tx hash", async () => {
    const req = await createRequest(merchant, wallet);
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference });
    const row = await getRequest(req.id);
    expect(row).toMatchObject({ status: "PAID", receivedStroops: USDC(50), paidTxHash: p?.txHash });
    expect(row.paidAt).toEqual(p?.ledgerClosedAt);
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "COUNTED", requestId: req.id, memoNormalized: req.reference });
    expect(await events(req.id)).toMatchObject([
      { fromStatus: "PENDING", toStatus: "PAID", reason: "payment_counted", actor: "system", paymentEventId: p?.eventId },
    ]);
  });

  it("P2: a payment with no memo is NO_MEMO and appears in the unmatched list", async () => {
    const req = await createRequest(merchant, wallet);
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50) });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "NO_MEMO", requestId: null });
    expect((await getRequest(req.id)).status).toBe("PENDING");
    const list = await merchant.agent.get("/v1/payments?unmatched=true");
    expect(list.body.data).toMatchObject([{ eventId: p?.eventId, outcome: "NO_MEMO", amount: "50.0000000" }]);
  });

  it("P3: a memo that belongs to no request is UNKNOWN_MEMO and unmatched", async () => {
    const [a, b] = await e.pay([
      { to: wallet.address, amountStroops: USDC(1), memoRaw: "RD00000000" },
      { to: wallet.address, amountStroops: USDC(1), memoRaw: "thanks for lunch" },
    ]);
    expect((await getPayment(a!.eventId)).outcome).toBe("UNKNOWN_MEMO");
    expect((await getPayment(b!.eventId)).outcome).toBe("UNKNOWN_MEMO");
    const list = await merchant.agent.get("/v1/payments?unmatched=true");
    expect(list.body.data).toHaveLength(2);
  });

  it("P4: a memo typed in lowercase, with O for 0, spaces or dashes is normalised and COUNTED", async () => {
    const req = await createRequest(merchant, wallet);
    const typed = ` ${req.reference.slice(0, 2).toLowerCase()}-${req.reference.slice(2, 6).toLowerCase().replace(/0/g, "o")} ${req.reference.slice(6).replace(/1/g, "l")} `;
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: typed });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "COUNTED", memoRaw: typed.slice(0, 128), memoNormalized: req.reference });
    expect((await getRequest(req.id)).status).toBe("PAID");
  });

  it("P5: MEMO_ID or MEMO_HASH is MEMO_TYPE_MISMATCH and unmatched", async () => {
    const req = await createRequest(merchant, wallet);
    const [a, b] = await e.pay([
      { to: wallet.address, amountStroops: USDC(50), memoRaw: "12345", memoType: "id" },
      { to: wallet.address, amountStroops: USDC(50), memoRaw: "ab".repeat(32), memoType: "hash" },
    ]);
    expect((await getPayment(a!.eventId)).outcome).toBe("MEMO_TYPE_MISMATCH");
    expect((await getPayment(b!.eventId)).outcome).toBe("MEMO_TYPE_MISMATCH");
    expect((await getRequest(req.id)).status).toBe("PENDING");
  });

  it("P6: right memo but XLM for a USDC request is WRONG_ASSET; the request is unchanged", async () => {
    const req = await createRequest(merchant, wallet);
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference, assetCode: "XLM", assetIssuer: null });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "WRONG_ASSET", requestId: req.id });
    expect(await getRequest(req.id)).toMatchObject({ status: "PENDING", receivedStroops: 0n });
  });

  it("P7: 'USDC' from another issuer is WRONG_ISSUER; the request is unchanged", async () => {
    const req = await createRequest(merchant, wallet);
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference, assetIssuer: FAKE_ISSUER });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "WRONG_ISSUER", requestId: req.id });
    expect(await getRequest(req.id)).toMatchObject({ status: "PENDING", receivedStroops: 0n });
    const detail = await merchant.agent.get(`/v1/payment-requests/${req.id}`);
    expect(detail.body.payments).toMatchObject([{ outcome: "WRONG_ISSUER", asset: { code: "USDC", issuer: FAKE_ISSUER } }]);
  });

  it("P8: the memo of a request on a different wallet is WRONG_WALLET; the request is unchanged", async () => {
    const other = await setupMerchant(t, "Other Shop");
    const theirs = await createRequest(other.merchant, other.wallet);
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: theirs.reference });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "WRONG_WALLET", requestId: theirs.id, walletId: wallet.id });
    expect(await getRequest(theirs.id)).toMatchObject({ status: "PENDING", receivedStroops: 0n });
    // The wallet owner sees the payment, but not the other merchant's request id.
    const mine = await merchant.agent.get("/v1/payments");
    expect(mine.body.data).toMatchObject([{ outcome: "WRONG_WALLET", requestId: null }]);
    // The request's owner sees that someone paid the wrong wallet.
    const detail = await other.merchant.agent.get(`/v1/payment-requests/${theirs.id}`);
    // …with the address, but never the other merchant's internal wallet id.
    expect(detail.body.payments).toMatchObject([{ outcome: "WRONG_WALLET", to: wallet.address, walletId: null }]);
  });

  it("P9: an amount below the asked one is COUNTED -> PARTIALLY_PAID with the remaining amount exposed", async () => {
    const req = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(20), memoRaw: req.reference });
    expect(await getRequest(req.id)).toMatchObject({ status: "PARTIALLY_PAID", receivedStroops: USDC(20), paidTxHash: null });
    const pub = await merchant.agent.get(`/public/pay/${req.publicId}`);
    expect(pub.body).toMatchObject({ status: "PARTIALLY_PAID", usdcReceived: "20.0000000", usdcRemaining: "30.0000000" });
    expect(pub.body.sep7Uri).toContain("amount=30.0000000");
  });

  it("P10: partial payments that sum exactly end in PAID on the last one", async () => {
    const req = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(20), memoRaw: req.reference });
    await e.pay({ to: wallet.address, amountStroops: USDC(10), memoRaw: req.reference });
    expect(await getRequest(req.id)).toMatchObject({ status: "PARTIALLY_PAID", receivedStroops: USDC(30) });
    const [last] = await e.pay({ to: wallet.address, amountStroops: USDC(20), memoRaw: req.reference });
    expect(await getRequest(req.id)).toMatchObject({ status: "PAID", receivedStroops: USDC(50), paidTxHash: last?.txHash });
    // PARTIALLY_PAID -> PARTIALLY_PAID is audited but is not a status change.
    expect((await events(req.id)).map((ev) => `${ev.fromStatus}>${ev.toStatus}`)).toEqual([
      "PENDING>PARTIALLY_PAID",
      "PARTIALLY_PAID>PARTIALLY_PAID",
      "PARTIALLY_PAID>PAID",
    ]);
    expect(await prisma.chainPayment.count({ where: { requestId: req.id, outcome: "COUNTED" } })).toBe(3);
  });

  it("P11: more than asked, or partials that overshoot, is COUNTED -> OVERPAID", async () => {
    const one = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(60), memoRaw: one.reference });
    expect(await getRequest(one.id)).toMatchObject({ status: "OVERPAID", receivedStroops: USDC(60) });

    const two = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(30), memoRaw: two.reference });
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(30), memoRaw: two.reference });
    expect(await getRequest(two.id)).toMatchObject({ status: "OVERPAID", receivedStroops: USDC(60), paidTxHash: p?.txHash });
    const detail = await merchant.agent.get(`/v1/payment-requests/${two.id}`);
    expect(detail.body.request).toMatchObject({ refundOwed: true, usdcRemaining: "0.0000000" });
  });

  it("P12: any payment after PAID or OVERPAID is DUPLICATE and the status is unchanged", async () => {
    const req = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference });
    const [dup] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference });
    expect(await getPayment(dup!.eventId)).toMatchObject({ outcome: "DUPLICATE", requestId: req.id });
    expect(await getRequest(req.id)).toMatchObject({ status: "PAID", receivedStroops: USDC(50) });
    // The duplicate is money to send back: flagged on the detail, the list and the action responses.
    expect((await merchant.agent.get(`/v1/payment-requests/${req.id}`)).body.request.refundOwed).toBe(true);
    expect((await merchant.agent.get("/v1/payment-requests?status=PAID")).body.data[0].refundOwed).toBe(true);

    const over = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(51), memoRaw: over.reference });
    const [dup2] = await e.pay({ to: wallet.address, amountStroops: USDC(1), memoRaw: over.reference });
    expect((await getPayment(dup2!.eventId)).outcome).toBe("DUPLICATE");
    expect(await getRequest(over.id)).toMatchObject({ status: "OVERPAID", receivedStroops: USDC(51) });
  });

  it("P13: two payment operations to one request in one transaction are two events, both COUNTED and summed", async () => {
    const req = await createRequest(merchant, wallet);
    const txHash = "ab".repeat(32);
    const [a, b] = await e.pay([
      { to: wallet.address, amountStroops: USDC(25), memoRaw: req.reference, txHash },
      { to: wallet.address, amountStroops: USDC(25), memoRaw: req.reference, txHash },
    ]);
    expect(a?.eventId).not.toBe(b?.eventId);
    expect((await getPayment(a!.eventId)).outcome).toBe("COUNTED");
    expect((await getPayment(b!.eventId)).outcome).toBe("COUNTED");
    expect(await getRequest(req.id)).toMatchObject({ status: "PAID", receivedStroops: USDC(50), paidTxHash: txHash });
  });

  it("P14: a path payment (payer sends XLM, wallet gets USDC) is counted by the USDC received", async () => {
    const req = await createRequest(merchant, wallet);
    // The wallet-side event of a path payment is a USDC transfer from the last hop.
    const pool = "LA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUGCF";
    await e.pay({ to: wallet.address, from: pool, amountStroops: USDC(50), memoRaw: req.reference });
    expect(await getRequest(req.id)).toMatchObject({ status: "PAID", receivedStroops: USDC(50) });
  });

  it("P15: a payment from a contract wallet (C address) is detected and matched normally", async () => {
    const req = await createRequest(merchant, wallet);
    const contract = "CAYPAQDKNWMHRATKU5DQ327VDHVRSIVK7UGVWT2A5SUZCUFTLUHXH2JA";
    const [p] = await e.pay({ to: wallet.address, from: contract, amountStroops: USDC(50), memoRaw: req.reference });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "COUNTED", fromAddress: contract });
    expect((await getRequest(req.id)).status).toBe("PAID");
  });

  it("P15: a contract wallet pays the request's muxed address (no memo possible) and is matched automatically", async () => {
    const req = await createRequest(merchant, wallet);
    expect(req.muxedAddress).toMatch(/^M[A-Z2-7]{68}$/);
    const contract = "CAYPAQDKNWMHRATKU5DQ327VDHVRSIVK7UGVWT2A5SUZCUFTLUHXH2JA";
    // What the chain reports for a transfer to that M-address: base G + the mux id.
    const [p] = await e.pay({ to: wallet.address, from: contract, amountStroops: USDC(50), memoRaw: req.memoId, memoType: "id", toMuxedId: req.memoId });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "COUNTED", requestId: req.id, memoNormalized: req.reference, toMuxedId: req.memoId });
    expect((await getRequest(req.id)).status).toBe("PAID");
    const pub = await merchant.agent.get(`/public/pay/${req.publicId}`);
    expect(pub.body).toMatchObject({ memoId: req.memoId, muxedAddress: req.muxedAddress });
  });

  it("P5: a MEMO_ID equal to the request's numeric reference is matched (for payers that only support numeric memos)", async () => {
    const req = await createRequest(merchant, wallet);
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(20), memoRaw: req.memoId, memoType: "id" });
    expect((await getPayment(p!.eventId)).outcome).toBe("COUNTED");
    expect((await getRequest(req.id)).status).toBe("PARTIALLY_PAID");
  });

  it("P16: a mux id that happens to equal another wallet's request stays MEMO_TYPE_MISMATCH and linkable", async () => {
    const other = await setupMerchant(t, "Other Shop");
    const theirs = await createRequest(other.merchant, other.wallet);
    const mine = await createRequest(merchant, wallet);
    // This merchant's own customer id collides with the other merchant's numeric reference.
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: theirs.memoId, memoType: "id", toMuxedId: theirs.memoId });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "MEMO_TYPE_MISMATCH", requestId: null, memoNormalized: null });
    expect((await getRequest(theirs.id)).status).toBe("PENDING");
    const detail = await other.merchant.agent.get(`/v1/payment-requests/${theirs.id}`);
    expect(detail.body.payments).toEqual([]);
    const res = await merchant.agent.post(`/v1/payments/${p!.eventId}/link`).set("Origin", ORIGIN).send({ requestId: mine.id });
    expect(res.body).toMatchObject({ payment: { outcome: "COUNTED" }, request: { status: "PAID" } });
  });

  it("P16: a payment to the wallet's M-address resolves the base wallet; the mux id makes it MEMO_TYPE_MISMATCH and linkable", async () => {
    const req = await createRequest(merchant, wallet);
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: "42", memoType: "id", toMuxedId: "42" });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "MEMO_TYPE_MISMATCH", toMuxedId: "42", walletId: wallet.id });
    const res = await merchant.agent.post(`/v1/payments/${p!.eventId}/link`).set("Origin", ORIGIN).send({ requestId: req.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ payment: { outcome: "COUNTED", linkedManually: true }, request: { status: "PAID" } });
  });

  it("P17: a payment from the asset issuer (a mint) is matched normally", async () => {
    const req = await createRequest(merchant, wallet);
    const [p] = await e.pay({ to: wallet.address, from: USDC_ISSUER, eventType: "mint", amountStroops: USDC(50), memoRaw: req.reference });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "COUNTED", eventType: "mint" });
    expect((await getRequest(req.id)).status).toBe("PAID");
  });

  it("P18: off by one stroop is PARTIALLY_PAID or OVERPAID, never rounded", async () => {
    const under = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(50) - 1n, memoRaw: under.reference });
    expect(await getRequest(under.id)).toMatchObject({ status: "PARTIALLY_PAID", receivedStroops: 499_999_999n });
    const pub = await merchant.agent.get(`/public/pay/${under.publicId}`);
    expect(pub.body.usdcRemaining).toBe("0.0000001");

    const over = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(50) + 1n, memoRaw: over.reference });
    expect(await getRequest(over.id)).toMatchObject({ status: "OVERPAID", receivedStroops: 500_000_001n });
  });

  it("P19: a failed transaction emits no event, so nothing is recorded", async () => {
    const req = await createRequest(merchant, wallet);
    e.source.closeLedger(new Date(), []); // the failed tx's ledger: no events
    await e.ingestion.tick();
    expect(await prisma.chainPayment.count()).toBe(0);
    expect((await getRequest(req.id)).status).toBe("PENDING");
  });

  it("P20: a fee-bump transaction stores the outer and inner hashes", async () => {
    const req = await createRequest(merchant, wallet);
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference, txHash: "0f".repeat(32), innerTxHash: "1e".repeat(32) });
    expect(await getPayment(p!.eventId)).toMatchObject({ txHash: "0f".repeat(32), innerTxHash: "1e".repeat(32), outcome: "COUNTED" });
    const detail = await merchant.agent.get(`/v1/payment-requests/${req.id}`);
    expect(detail.body.payments[0]).toMatchObject({ txHash: "0f".repeat(32), innerTxHash: "1e".repeat(32) });
    expect(detail.body.request.paidTxHash).toBe("0f".repeat(32));
  });

  it("P21: funds from a claimable-balance claim carry no memo: NO_MEMO, then linkable", async () => {
    const req = await createRequest(merchant, wallet);
    const balance = "BAAD6DBUX6J22DMZOHIEZTEQ64CVCHEDRKWZONFEUL5Q26QD7R76RGR4TU";
    const [p] = await e.pay({ to: wallet.address, from: balance, amountStroops: USDC(50) });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "NO_MEMO", fromAddress: balance });
    const res = await merchant.agent.post(`/v1/payments/${p!.eventId}/link`).set("Origin", ORIGIN).send({ requestId: req.id });
    expect(res.body).toMatchObject({ payment: { outcome: "COUNTED" }, request: { status: "PAID", paidTxHash: p?.txHash } });
  });

  it("C8: two payments landing together are serialised by the row lock: exact sum, one status change each", async () => {
    const req = await createRequest(merchant, wallet);
    const [a, b] = e.source.closeLedger(new Date(), [
      { to: wallet.address, amountStroops: USDC(25), memoRaw: req.reference },
      { to: wallet.address, amountStroops: USDC(25), memoRaw: req.reference },
    ]);
    const w = { id: wallet.id, merchantId: merchant.id };
    // Two separate transactions racing on the same request row.
    await Promise.all([
      prisma.$transaction((tx) => processPayment(tx, a!, w)),
      prisma.$transaction((tx) => processPayment(tx, b!, w)),
    ]);
    expect(await getRequest(req.id)).toMatchObject({ status: "PAID", receivedStroops: USDC(50) });
    expect((await events(req.id)).map((ev) => `${ev.fromStatus}>${ev.toStatus}`)).toEqual(["PENDING>PARTIALLY_PAID", "PARTIALLY_PAID>PAID"]);
  });

  it("C8: the same event processed twice concurrently is recorded and counted once", async () => {
    const req = await createRequest(merchant, wallet);
    const [a] = e.source.closeLedger(new Date(), [{ to: wallet.address, amountStroops: USDC(20), memoRaw: req.reference }]);
    const w = { id: wallet.id, merchantId: merchant.id };
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => prisma.$transaction((tx) => processPayment(tx, a!, w))),
    );
    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(await prisma.chainPayment.count()).toBe(1);
    expect(await getRequest(req.id)).toMatchObject({ status: "PARTIALLY_PAID", receivedStroops: USDC(20) });
  });

  it("ignores payments to wallets nobody registered and from before a NUL-laden memo", async () => {
    const req = await createRequest(merchant, wallet);
    const [stranger, nul] = await e.pay([
      { to: PAYER, amountStroops: USDC(50), memoRaw: req.reference },
      { to: wallet.address, amountStroops: USDC(1), memoRaw: "RD\u0000bad\u0000" },
    ]);
    expect(await prisma.chainPayment.findUnique({ where: { eventId: stranger!.eventId } })).toBeNull();
    expect(await getPayment(nul!.eventId)).toMatchObject({ outcome: "UNKNOWN_MEMO", memoRaw: "RDbad" });
    expect((await getRequest(req.id)).status).toBe("PENDING");
  });
});

describe("payments with no reference at all", () => {
  const unmatchedList = async () => (await merchant.agent.get("/v1/payments?unmatched=true")).body.data;

  it("P2: by default it stays unmatched, with the one request it exactly settles suggested for a one-click link", async () => {
    const req = await createRequest(merchant, wallet, { amount: "37.5" });
    await createRequest(merchant, wallet, { amount: "12" });
    const [p] = await e.pay({ to: wallet.address, amountStroops: 375_000_000n });
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "NO_MEMO", requestId: null, matchedBy: null });
    expect(await unmatchedList()).toMatchObject([{ eventId: p?.eventId, suggestedRequestId: req.id }]);
    const res = await merchant.agent.post(`/v1/payments/${p!.eventId}/link`).set("Origin", ORIGIN).send({ requestId: req.id });
    expect(res.body.payment).toMatchObject({ outcome: "COUNTED", matchedBy: "manual" });
  });

  it("P2: no suggestion when the amount fits no request, fits two, or the request has expired", async () => {
    await createRequest(merchant, wallet, { amount: "20" });
    await createRequest(merchant, wallet, { amount: "20" });
    const expired = await createRequest(merchant, wallet, { amount: "30" });
    await prisma.paymentRequest.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await e.pay([
      { to: wallet.address, amountStroops: USDC(20) }, // two candidates
      { to: wallet.address, amountStroops: USDC(19) }, // none
      { to: wallet.address, amountStroops: USDC(30) }, // only an expired one
      { to: wallet.address, amountStroops: USDC(20), assetCode: "XLM", assetIssuer: null }, // wrong asset
    ]);
    const list = await unmatchedList();
    expect(list).toHaveLength(4);
    expect(list.every((p: { suggestedRequestId: string | null }) => p.suggestedRequestId === null)).toBe(true);
  });

  it("P2: Randi never matches by amount: a memo-less payment that exactly fits one request stays unmatched", async () => {
    const req = await createRequest(merchant, wallet, { amount: "9" });
    const contract = "CAYPAQDKNWMHRATKU5DQ327VDHVRSIVK7UGVWT2A5SUZCUFTLUHXH2JA";
    const [p] = await e.pay({ to: wallet.address, from: contract, amountStroops: USDC(9) }); // plain G address, no memo
    expect(await getPayment(p!.eventId)).toMatchObject({ outcome: "NO_MEMO", requestId: null, matchedBy: null });
    expect(await getRequest(req.id)).toMatchObject({ status: "PENDING", receivedStroops: 0n });
    // Only a hint for the merchant, never an automatic match.
    expect(await unmatchedList()).toMatchObject([{ eventId: p?.eventId, suggestedRequestId: req.id }]);
  });
});

describe("refund amounts", () => {
  it("a stranger's one-stroop payments on a public memo cannot raise refundOwed, but are still listed", async () => {
    const req = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference }); // the real payment
    // Griefing: dust in the wrong asset, and dust on the already-paid request.
    await e.pay({ to: wallet.address, amountStroops: 1n, memoRaw: req.reference, assetCode: "XLM", assetIssuer: null });
    await e.pay({ to: wallet.address, amountStroops: 1n, memoRaw: req.reference });
    const dust = (await merchant.agent.get(`/v1/payment-requests/${req.id}`)).body.request;
    expect(dust.refundOwed).toBe(false);
    expect(dust.refundDue).toEqual(
      expect.arrayContaining([
        { asset: { code: "XLM", issuer: null }, amount: "0.0000001", amountStroops: "1" },
        { asset: { code: "USDC", issuer: req.asset.issuer }, amount: "0.0000001", amountStroops: "1" },
      ]),
    );
    expect((await merchant.agent.get("/v1/payment-requests")).body.data[0]).toMatchObject({ refundOwed: false });

    // A real duplicate does raise it, with the exact amount to send back.
    await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference });
    const real = (await merchant.agent.get(`/v1/payment-requests/${req.id}`)).body.request;
    expect(real.refundOwed).toBe(true);
    expect(real.refundDue).toEqual(
      expect.arrayContaining([{ asset: { code: "USDC", issuer: req.asset.issuer }, amount: "50.0000001", amountStroops: "500000001" }]),
    );
    const listed = (await merchant.agent.get("/v1/payment-requests")).body.data[0];
    expect(listed.refundDue).toEqual(real.refundDue);
  });

  it("an overpayment lists the excess, and a new request owes nothing", async () => {
    const fresh = await createRequest(merchant, wallet);
    expect(fresh).toMatchObject({ refundOwed: false, refundDue: [] });
    await e.pay({ to: wallet.address, amountStroops: USDC(62), memoRaw: fresh.reference });
    const over = (await merchant.agent.get(`/v1/payment-requests/${fresh.id}`)).body.request;
    expect(over).toMatchObject({ status: "OVERPAID", refundOwed: true, refundDue: [{ amount: "12.0000000", asset: { code: "USDC" } }] });
  });
});

describe("recording refunds", () => {
  const post = (path: string, body: object = {}) => merchant.agent.post(path).set("Origin", ORIGIN).send(body);
  const detail = async (id: string) => (await merchant.agent.get(`/v1/payment-requests/${id}`)).body;

  it("marking an unapplied payment as refunded clears it from what is owed", async () => {
    const req = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference });
    const [dup] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference });
    expect((await detail(req.id)).request).toMatchObject({ refundOwed: true, refundDue: [{ amount: "50.0000000" }] });

    expect((await post(`/v1/payments/${dup!.eventId}/refunded`, { txHash: "nope" })).status).toBe(400);
    const txHash = "AB".repeat(32);
    const res = await post(`/v1/payments/${dup!.eventId}/refunded`, { txHash });
    expect(res.status).toBe(200);
    expect(res.body.payment).toMatchObject({ outcome: "DUPLICATE", refundTxHash: "ab".repeat(32) });
    expect(res.body.payment.refundedAt).toBeTruthy();
    const after = await detail(req.id);
    expect(after.request).toMatchObject({ status: "PAID", refundOwed: false, refundDue: [] });
    expect(after.payments.find((p: { eventId: string }) => p.eventId === dup!.eventId).refundedAt).toBeTruthy();
    // Recording it twice changes nothing.
    const again = await post(`/v1/payments/${dup!.eventId}/refunded`);
    expect(again.body.payment.refundedAt).toBe(res.body.payment.refundedAt);
    expect(again.body.payment.refundTxHash).toBe("ab".repeat(32));
  });

  it("a payment that was applied is not refunded on its own; the request is", async () => {
    const req = await createRequest(merchant, wallet);
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(62), memoRaw: req.reference });
    const onPayment = await post(`/v1/payments/${p!.eventId}/refunded`);
    expect(onPayment.status).toBe(409);
    expect(onPayment.body.error.code).toBe("INVALID_TRANSITION");

    expect((await detail(req.id)).request).toMatchObject({ status: "OVERPAID", refundOwed: true, refundDue: [{ amount: "12.0000000" }] });
    const res = await post(`/v1/payment-requests/${req.id}/refunded`);
    expect(res.status).toBe(200);
    expect(res.body.request).toMatchObject({ status: "OVERPAID", refundOwed: false, refundDue: [] });
    expect(res.body.request.refundedAt).toBeTruthy();
    expect((await merchant.agent.get("/v1/payment-requests")).body.data[0]).toMatchObject({ refundOwed: false });
  });

  it("a request with nothing of its own to refund refuses the mark", async () => {
    const pending = await createRequest(merchant, wallet);
    const res = await post(`/v1/payment-requests/${pending.id}/refunded`);
    expect(res.status).toBe(409);
    const paid = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: paid.reference });
    expect((await post(`/v1/payment-requests/${paid.id}/refunded`)).status).toBe(409);
    expect((await post(`/v1/payment-requests/nope/refunded`)).status).toBe(404);
  });

  it("an unmatched payment marked refunded leaves the unmatched list and can no longer be linked", async () => {
    const req = await createRequest(merchant, wallet);
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50) });
    expect((await merchant.agent.get("/v1/payments?unmatched=true")).body.data).toHaveLength(1);
    expect((await post(`/v1/payments/${p!.eventId}/refunded`)).status).toBe(200);
    expect((await merchant.agent.get("/v1/payments?unmatched=true")).body.data).toEqual([]);
    // It is still in the full history, marked as refunded.
    expect((await merchant.agent.get("/v1/payments")).body.data[0].refundedAt).toBeTruthy();
    const assign = await post(`/v1/payments/${p!.eventId}/link`, { requestId: req.id });
    expect(assign.status).toBe(409);
    expect(assign.body.error.code).toBe("PAYMENT_NOT_LINKABLE");
    expect((await getRequest(req.id)).status).toBe("PENDING");
  });

  it("T8: an expired request with late money stays EXPIRED: no endpoint can mark it paid", async () => {
    const req = await createRequest(merchant, wallet);
    await e.pay({ to: wallet.address, amountStroops: USDC(20), memoRaw: req.reference }, new Date(Date.now() - 10 * 60_000));
    await prisma.paymentRequest.update({ where: { id: req.id }, data: { expiresAt: new Date(Date.now() - 5 * 60_000) } });
    const [late] = await e.pay({ to: wallet.address, amountStroops: USDC(30), memoRaw: req.reference });
    expect((await getPayment(late!.eventId)).outcome).toBe("LATE");
    expect((await detail(req.id)).request.refundDue).toMatchObject([{ amount: "50.0000000" }]); // 20 counted + 30 late
    expect((await post(`/v1/payment-requests/${req.id}/refunded`)).status).toBe(200);
    expect((await detail(req.id)).request.refundDue).toMatchObject([{ amount: "30.0000000" }]);
    for (const path of ["accept", "mark-paid", "paid"]) {
      expect((await post(`/v1/payment-requests/${req.id}/${path}`, { txHash: late!.txHash })).status).toBe(404);
    }
    expect((await getRequest(req.id)).status).toBe("EXPIRED");
  });
});

describe("manual link", () => {
  it("only unmatched USDC payments on the same wallet can be linked", async () => {
    const req = await createRequest(merchant, wallet);
    const [unmatched, wrongAsset, unmatchedXlm] = await e.pay([
      { to: wallet.address, amountStroops: USDC(50) },
      { to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference, assetCode: "XLM", assetIssuer: null },
      { to: wallet.address, amountStroops: USDC(50), assetCode: "XLM", assetIssuer: null },
    ]);
    const assign = (eventId: string, requestId: string) =>
      merchant.agent.post(`/v1/payments/${eventId}/link`).set("Origin", ORIGIN).send({ requestId });

    // WRONG_ASSET is not an unmatched outcome.
    expect((await assign(wrongAsset!.eventId, req.id)).body.error).toMatchObject({ code: "PAYMENT_NOT_LINKABLE" });
    // An XLM payment with no reference cannot be linked to a USDC request.
    const mismatch = await assign(unmatchedXlm!.eventId, req.id);
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe("PAYMENT_NOT_LINKABLE");
    // A request on another wallet of the same merchant.
    const second = await (await import("../helpers/harness")).addVerifiedWallet(merchant);
    const elsewhere = await createRequest(merchant, second);
    expect((await assign(unmatched!.eventId, elsewhere.id)).status).toBe(409);
    expect((await assign(unmatched!.eventId, "nope")).status).toBe(404);
    expect((await assign("0000000000000000000-0000000000", req.id)).status).toBe(404);

    const ok = await assign(unmatched!.eventId, req.id);
    expect(ok.body).toMatchObject({ payment: { outcome: "COUNTED", requestId: req.id, linkedManually: true }, request: { status: "PAID", usdcReceived: "50.0000000" } });
    expect(ok.body.payment.linkedAt).toBeTruthy();
    // Already linked: cannot be linked again (no double counting).
    expect((await assign(unmatched!.eventId, req.id)).status).toBe(409);
    expect((await merchant.agent.get("/v1/payments?unmatched=true")).body.data).toHaveLength(1); // the XLM one
  });

  it("runs the normal status switch: linking to a PAID request is DUPLICATE, to a cancelled one AFTER_CANCEL", async () => {
    const paid = await createRequest(merchant, wallet);
    const cancelled = await createRequest(merchant, wallet);
    await merchant.agent.post(`/v1/payment-requests/${cancelled.id}/cancel`).set("Origin", ORIGIN).send();
    const [, a, b] = await e.pay([
      { to: wallet.address, amountStroops: USDC(50), memoRaw: paid.reference },
      { to: wallet.address, amountStroops: USDC(5) },
      { to: wallet.address, amountStroops: USDC(5) },
    ]);
    const r1 = await merchant.agent.post(`/v1/payments/${a!.eventId}/link`).set("Origin", ORIGIN).send({ requestId: paid.id });
    expect(r1.body).toMatchObject({ payment: { outcome: "DUPLICATE", requestId: paid.id }, request: { status: "PAID", usdcReceived: "50.0000000" } });
    const r2 = await merchant.agent.post(`/v1/payments/${b!.eventId}/link`).set("Origin", ORIGIN).send({ requestId: cancelled.id });
    expect(r2.body).toMatchObject({ payment: { outcome: "AFTER_CANCEL" }, request: { status: "CANCELLED" } });
  });

  it("two concurrent links of the same payment count it once", async () => {
    const req = await createRequest(merchant, wallet, { amount: "100" });
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(40) });
    const go = () => merchant.agent.post(`/v1/payments/${p!.eventId}/link`).set("Origin", ORIGIN).send({ requestId: req.id });
    const results = await Promise.all([go(), go(), go()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect(await getRequest(req.id)).toMatchObject({ status: "PARTIALLY_PAID", receivedStroops: USDC(40) });
  });
});
