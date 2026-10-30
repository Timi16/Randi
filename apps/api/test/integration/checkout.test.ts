import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PgListener } from "../../src/db/notify";
import {
  createRequest,
  makeApp,
  makeEngine,
  ORIGIN,
  prisma,
  resetDb,
  setupMerchant,
  startListener,
  USDC,
  type TestApp,
  type TestEngine,
  type TestMerchant,
  type TestWallet,
} from "../helpers/harness";

let t: TestApp;
let listener: PgListener;
let server: Server;
let base: string;
let e: TestEngine;
let merchant: TestMerchant;
let wallet: TestWallet;
const open: SseClient[] = [];

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

/** Minimal SSE client over fetch: collects events and lets a test wait for one. */
class SseClient {
  readonly events: SseEvent[] = [];
  status = 0;
  ended = false;
  private readonly controller = new AbortController();
  private waiters: (() => void)[] = [];

  static async connect(url: string, headers: Record<string, string> = {}): Promise<SseClient> {
    const client = new SseClient();
    open.push(client);
    const res = await fetch(url, { headers, signal: client.controller.signal });
    client.status = res.status;
    if (res.status !== 200 || !res.body) {
      client.ended = true;
      return client;
    }
    void client.pump(res.body);
    return client;
  }

  private async pump(body: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for await (const chunk of body) {
        buffer += decoder.decode(chunk, { stream: true });
        let index: number;
        while ((index = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (event && data) this.events.push({ event, data: JSON.parse(data) as Record<string, unknown> });
          this.wake();
        }
      }
    } catch {
      // aborted
    }
    this.ended = true;
    this.wake();
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  async waitFor(predicate: (c: SseClient) => boolean, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate(this)) {
      if (Date.now() > deadline) throw new Error(`SSE wait timed out; got ${JSON.stringify(this.events)}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 100);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  statuses(): unknown[] {
    return this.events.filter((ev) => ev.event === "status").map((ev) => ev.data.status);
  }

  close(): void {
    this.controller.abort();
  }
}

beforeAll(async () => {
  t = makeApp({ sseStreamsPerIp: 5 });
  listener = await startListener(t.hub);
  server = t.app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(async () => {
  await resetDb();
  e = makeEngine();
  ({ merchant, wallet } = await setupMerchant(t));
  await e.ingestion.tick();
});
afterEach(() => {
  for (const client of open.splice(0)) client.close();
});
afterAll(async () => {
  t.sse.closeAll();
  await listener.stop();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

describe("checkout API", () => {
  it("C1: an unknown or malformed publicId is 404", async () => {
    for (const id of ["aaaaaaaaaaaa", "short", "has-dash-here", "x".repeat(200), "%00%00%00%00"]) {
      const res = await request(t.app).get(`/public/pay/${id}`);
      expect(res.status, id).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect((await request(t.app).get(`/public/pay/${id}/events`)).status).toBe(404);
    }
  });

  it("C2: returns exactly the public fields: ZAR, USDC, network, asset, wallet, reference, status; nothing else about the merchant leaks", async () => {
    const req = await createRequest(merchant, wallet, { zarAmount: "500.00", amount: "27.03", description: "Birthday cake", customerRef: "Order #1042" });
    const res = await request(t.app).get(`/public/pay/${req.publicId}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      [
        "requestId", "businessName", "supportContact", "network", "zarAmount", "usdcAmount", "usdcReceived", "usdcRemaining", "pricing",
        "asset", "wallet", "walletVerified", "reference", "memoId", "muxedAddress", "description", "customerRef", "status", "expiresAt",
        "paidTxHash", "paidAt", "explorerUrl", "canReceive", "cannotReceiveReason", "rejectedPayments", "sep7Uri",
      ].sort(),
    );
    expect(res.body).toMatchObject({
      requestId: req.publicId,
      businessName: "Acme Shop",
      network: "Stellar Testnet",
      zarAmount: "500.00",
      usdcAmount: "27.0300000",
      pricing: { mode: "MANUAL", rate: null },
      asset: { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
      wallet: wallet.address,
      walletVerified: true,
      reference: req.reference,
      customerRef: "Order #1042",
      status: "PENDING",
      paidTxHash: null,
      explorerUrl: null,
      canReceive: true,
      cannotReceiveReason: null,
      rejectedPayments: [],
    });
    expect(res.body.sep7Uri).toContain(`destination=${wallet.address}`);
    expect(res.body.sep7Uri).toContain(`memo=${req.reference}`);
    expect(res.body.sep7Uri).toContain("amount=27.0300000");
    expect(res.body.sep7Uri).toContain("asset_code=USDC");
    const text = JSON.stringify(res.body);
    for (const secret of [merchant.email, merchant.id, req.id, wallet.id]) expect(text).not.toContain(secret);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("C2: once paid, the page shows the verified tx hash with an explorer link; a wrong-asset payment is reported, not applied", async () => {
    const req = await createRequest(merchant, wallet);
    const [xlm] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference, assetCode: "XLM", assetIssuer: null });
    const before = (await request(t.app).get(`/public/pay/${req.publicId}`)).body;
    expect(before).toMatchObject({ status: "PENDING", rejectedPayments: [{ outcome: "WRONG_ASSET", asset: { code: "XLM", issuer: null }, amount: "50.0000000", txHash: xlm?.txHash }] });
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference });
    const after = (await request(t.app).get(`/public/pay/${req.publicId}`)).body;
    expect(after).toMatchObject({ status: "PAID", paidTxHash: p?.txHash, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${p?.txHash}` });
  });

  it("C5: reloading after paying returns the current status from the snapshot", async () => {
    const req = await createRequest(merchant, wallet);
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference });
    const res = await request(t.app).get(`/public/pay/${req.publicId}`);
    expect(res.body).toMatchObject({ status: "PAID", usdcReceived: "50.0000000", usdcRemaining: "0.0000000", paidTxHash: p?.txHash });
  });

  it("streams the snapshot on connect, then each status change live", async () => {
    const req = await createRequest(merchant, wallet);
    const sse = await SseClient.connect(`${base}/public/pay/${req.publicId}/events`);
    expect(sse.status).toBe(200);
    await sse.waitFor((c) => c.events.length >= 1);
    expect(sse.events[0]).toMatchObject({ event: "status", data: { status: "PENDING", usdcReceived: "0.0000000", usdcRemaining: "50.0000000", paidTxHash: null } });
    expect(Object.keys(sse.events[0]!.data).sort()).toEqual(["expiresAt", "paidAt", "paidTxHash", "status", "usdcReceived", "usdcRemaining"]);

    await e.pay({ to: wallet.address, amountStroops: USDC(20), memoRaw: req.reference });
    await sse.waitFor((c) => c.statuses().includes("PARTIALLY_PAID"));
    const [p] = await e.pay({ to: wallet.address, amountStroops: USDC(30), memoRaw: req.reference });
    await sse.waitFor((c) => c.statuses().includes("PAID"));
    expect(sse.events.at(-1)?.data).toMatchObject({ status: "PAID", usdcReceived: "50.0000000", paidTxHash: p?.txHash });
    // The stream closes itself about 5 s after a final status.
    await sse.waitFor((c) => c.ended, 9000);
  }, 20_000);

  it("C6: a dropped stream that reconnects gets the snapshot, so the final status is never missed", async () => {
    const req = await createRequest(merchant, wallet);
    const first = await SseClient.connect(`${base}/public/pay/${req.publicId}/events`);
    await first.waitFor((c) => c.events.length >= 1);
    first.close(); // connection drops
    await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference }); // paid while offline
    const second = await SseClient.connect(`${base}/public/pay/${req.publicId}/events`);
    await second.waitFor((c) => c.events.length >= 1);
    expect(second.events[0]?.data).toMatchObject({ status: "PAID", usdcReceived: "50.0000000" });
  });

  it("C6: after the database LISTEN connection is re-established, open streams are resynced", async () => {
    const req = await createRequest(merchant, wallet);
    const sse = await SseClient.connect(`${base}/public/pay/${req.publicId}/events`);
    await sse.waitFor((c) => c.events.length >= 1);
    await listener.stop(); // notifications are lost while the listener is down
    await e.pay({ to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference });
    expect(sse.statuses()).toEqual(["PENDING"]);
    await listener.start(); // reconnect -> resync
    await sse.waitFor((c) => c.statuses().includes("PAID"));
  });

  it("C6: rapid status changes reach the stream in order: the last event is the final status", async () => {
    const req = await createRequest(merchant, wallet, { amount: "10" });
    const sse = await SseClient.connect(`${base}/public/pay/${req.publicId}/events`);
    await sse.waitFor((c) => c.events.length >= 1);
    // Ten partial payments in ten ledgers, ingested back to back.
    for (let i = 0; i < 10; i++) e.source.closeLedger(new Date(), [{ to: wallet.address, amountStroops: USDC(1), memoRaw: req.reference }]);
    while ((await e.ingestion.tick()).processed > 0);
    await sse.waitFor((c) => c.statuses().includes("PAID"));
    await new Promise((r) => setTimeout(r, 300));
    const received = sse.events.filter((ev) => ev.event === "status").map((ev) => ev.data.usdcReceived as string);
    expect(received.at(-1)).toBe("10.0000000");
    expect(sse.statuses().at(-1)).toBe("PAID");
    // Amounts never go backwards on the customer's screen.
    expect([...received].sort()).toEqual(received);
  });

  it("caps open streams at 5 per IP", async () => {
    const req = await createRequest(merchant, wallet);
    const url = `${base}/public/pay/${req.publicId}/events`;
    const clients = [];
    for (let i = 0; i < 5; i++) clients.push(await SseClient.connect(url));
    expect(clients.every((c) => c.status === 200)).toBe(true);
    const sixth = await SseClient.connect(url);
    expect(sixth.status).toBe(429);
    clients[0]?.close();
    await new Promise((r) => setTimeout(r, 200));
    expect((await SseClient.connect(url)).status).toBe(200);
  });

  it("merchant stream delivers request.updated, payment.detected (matched, unmatched, rejected) and wallet.updated", async () => {
    const req = await createRequest(merchant, wallet);
    const login = await request(t.app).post("/auth/login").set("Origin", ORIGIN).send({ email: merchant.email, password: merchant.password });
    const cookie = String(login.headers["set-cookie"]).split(";")[0] as string;
    expect((await SseClient.connect(`${base}/v1/stream`)).status).toBe(401);
    const sse = await SseClient.connect(`${base}/v1/stream`, { cookie });
    expect(sse.status).toBe(200);
    await sse.waitFor((c) => c.events.some((ev) => ev.event === "ready"));

    await e.pay([
      { to: wallet.address, amountStroops: USDC(50), memoRaw: req.reference },
      { to: wallet.address, amountStroops: USDC(1) },
      { to: wallet.address, amountStroops: USDC(1), memoRaw: req.reference, assetCode: "XLM", assetIssuer: null },
    ]);
    await sse.waitFor((c) => c.events.filter((ev) => ev.event === "payment.detected").length >= 3);
    await sse.waitFor((c) => c.events.some((ev) => ev.event === "request.updated"));
    const outcomes = sse.events.filter((ev) => ev.event === "payment.detected").map((ev) => ev.data.outcome).sort();
    expect(outcomes).toEqual(["COUNTED", "NO_MEMO", "WRONG_ASSET"]);
    expect(sse.events.find((ev) => ev.event === "request.updated")?.data).toMatchObject({ id: req.id, status: "PAID" });

    await merchant.agent.post(`/v1/wallets/${wallet.id}/refresh`).set("Origin", ORIGIN);
    await sse.waitFor((c) => c.events.some((ev) => ev.event === "wallet.updated"));

    // Another merchant's activity never reaches this stream.
    const other = await setupMerchant(t, "Other");
    const theirs = await createRequest(other.merchant, other.wallet);
    const count = sse.events.length;
    await e.pay({ to: other.wallet.address, amountStroops: USDC(50), memoRaw: theirs.reference });
    await new Promise((r) => setTimeout(r, 400));
    expect(sse.events.slice(count).filter((ev) => ev.event !== "wallet.updated")).toEqual([]);
  }, 20_000);
});
