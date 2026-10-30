/**
 * End-to-end scenario on real Stellar Testnet. Doubles as the demo for David, and writes the
 * evidence file docs/Evidence.md (every request and every real transaction, with explorer links).
 *
 * Needs a running API and worker (`pnpm dev` + `pnpm dev:worker`) whose USDC_ISSUER is the
 * scenario's own issuer account, so the script can mint "USDC" freely:
 *
 *   pnpm scenario -- --print-issuer     # prints USDC_ISSUER=G… ; put it in .env, restart
 *   pnpm scenario                       # runs every case; add --skip-timing to skip the 5-min waits
 *
 * The API must run with EMAIL_VERIFICATION=off (or no SMTP_URL): the scenario signs up a throwaway
 * merchant and cannot read a code from an inbox.
 *
 * Each case creates a ZAR request through the API (fixed rate R18.50 = 1 USDC, so R92.50 asks
 * for 5.00 USDC), pays on-chain, then polls the API until the request status and payment
 * outcome are the expected ones.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeEvidence, type EvidenceRequest, type EvidenceTx } from "./evidence";
import {
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  Memo,
  nativeToScVal,
  Networks,
  Operation,
  rpc,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk";

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? "4300"}`;
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const HORIZON_URL = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const RPC_URL = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;
const KEYS_FILE = resolve(__dirname, "../../../.scenario-keys.json");
const EVIDENCE_FILE = resolve(__dirname, "../../../docs/Evidence.md");
/** The merchant's fixed rate for the run: R18.50 = 1 USDC, so R92.50 asks for exactly 5 USDC. */
const RATE = "18.50";
const args = new Set(process.argv.slice(2));
// --only=P15,P20 runs just those cases (setup still runs).
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;

const horizon = new Horizon.Server(HORIZON_URL);
const soroban = new rpc.Server(RPC_URL);

// ---------- keys ----------

interface Keys {
  issuer: Keypair;
  fakeIssuer: Keypair;
}

function loadKeys(): Keys {
  if (existsSync(KEYS_FILE)) {
    const saved = JSON.parse(readFileSync(KEYS_FILE, "utf8")) as { issuer: string; fakeIssuer: string };
    return { issuer: Keypair.fromSecret(saved.issuer), fakeIssuer: Keypair.fromSecret(saved.fakeIssuer) };
  }
  const keys = { issuer: Keypair.random(), fakeIssuer: Keypair.random() };
  // Throwaway testnet keys; the file is gitignored.
  writeFileSync(KEYS_FILE, JSON.stringify({ issuer: keys.issuer.secret(), fakeIssuer: keys.fakeIssuer.secret() }, null, 2), { mode: 0o600 });
  return keys;
}

// ---------- chain helpers ----------

/** Retries transient network failures (testnet endpoints time out now and then). */
async function withRetry<T>(what: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isHttpError = (err as { response?: unknown }).response !== undefined;
      if (isHttpError || attempt >= attempts) throw err;
      console.log(`  (${what}: network error, retry ${attempt}/${attempts - 1})`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

async function friendbot(address: string): Promise<void> {
  const res = await withRetry("friendbot", () => fetch(`https://friendbot.stellar.org?addr=${address}`, { signal: AbortSignal.timeout(60_000) }));
  if (!res.ok && res.status !== 400) throw new Error(`friendbot failed for ${address}: HTTP ${res.status}`);
}

interface SubmitOptions {
  memo?: Memo;
  signers?: Keypair[];
  feeBumpBy?: Keypair;
  /** The transaction is expected to fail on-chain. */
  allowFailure?: boolean;
}

async function submit(source: Keypair, ops: xdr.Operation[], opts: SubmitOptions = {}): Promise<string> {
  const account = await withRetry("load account", () => horizon.loadAccount(source.publicKey()));
  const builder = new TransactionBuilder(account, { fee: (Number.parseInt(BASE_FEE, 10) * 100).toString(), networkPassphrase: PASSPHRASE });
  for (const op of ops) builder.addOperation(op);
  if (opts.memo) builder.addMemo(opts.memo);
  const tx = builder.setTimeout(120).build();
  tx.sign(source, ...(opts.signers ?? []));
  const toSend = opts.feeBumpBy
    ? (() => {
        const fb = TransactionBuilder.buildFeeBumpTransaction(opts.feeBumpBy, (Number.parseInt(BASE_FEE, 10) * 200).toString(), tx, PASSPHRASE);
        fb.sign(opts.feeBumpBy);
        return fb;
      })()
    : tx;
  try {
    const res = await withRetry("submit", () => horizon.submitTransaction(toSend));
    return res.hash;
  } catch (err) {
    if (opts.allowFailure) return Buffer.from(toSend.hash()).toString("hex");
    const extras = (err as { response?: { data?: { extras?: unknown } } }).response?.data?.extras;
    throw new Error(`transaction failed: ${JSON.stringify(extras ?? String(err))}`, { cause: err });
  }
}

const pay = (destination: string, asset: Asset, amount: string) => Operation.payment({ destination, asset, amount });

// ---------- API helpers ----------

class Api {
  private cookie = "";

  async call<T = Record<string, unknown>>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T }> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: WEB_ORIGIN, ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0] ?? "";
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as T };
  }

  async ok<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.call<T>(method, path, body);
    if (res.status >= 300) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }
}

interface Req {
  id: string;
  publicId: string;
  reference: string;
  muxedAddress: string;
  wallet: string;
  status: string;
  zarAmount: string;
  usdcAmount: string;
  usdcReceived: string;
  expiresAt: string;
  paidTxHash: string | null;
  paymentUrl: string;
  pricing: { mode: string; rate: string | null };
  asset: { code: string; issuer: string | null };
}
interface Detail {
  request: Req;
  payments: { outcome: string; txHash: string; innerTxHash: string | null; eventId: string }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(what: string, fn: () => Promise<T | null>, timeoutMs = 90_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(2000);
  }
}

// ---------- the run ----------

async function main(): Promise<void> {
  const keys = loadKeys();
  if (args.has("--print-issuer")) {
    console.log(`USDC_ISSUER=${keys.issuer.publicKey()}`);
    return;
  }

  const USDC = new Asset("USDC", keys.issuer.publicKey());
  const FAKE_USDC = new Asset("USDC", keys.fakeIssuer.publicKey());
  const XLM = Asset.native();
  const walletKey = Keypair.random();
  const otherWalletKey = Keypair.random();
  const payer = Keypair.random();
  const wallet = walletKey.publicKey();

  // Make sure API_URL really is Randi before sending it anything.
  const health = await fetch(`${API}/health`).then((r) => r.json() as Promise<{ network?: string; db?: string }>).catch(() => null);
  if (health?.network !== "testnet" || health.db !== "up") {
    throw new Error(`${API} is not a healthy Randi API (check PORT / API_URL, and that the API is running)`);
  }

  console.log("Funding accounts with Friendbot…");
  for (const k of [keys.issuer, keys.fakeIssuer, walletKey, otherWalletKey, payer]) await friendbot(k.publicKey());
  console.log("Trustlines and balances…");
  for (const key of [walletKey, otherWalletKey, payer]) {
    await submit(key, [Operation.changeTrust({ asset: USDC }), Operation.changeTrust({ asset: FAKE_USDC })]);
  }
  await submit(keys.issuer, [pay(payer.publicKey(), USDC, "100000")]);
  await submit(keys.fakeIssuer, [pay(payer.publicKey(), FAKE_USDC, "100000")]);
  // Liquidity for the path payment case: the issuer sells USDC for XLM 1:1.
  await submit(keys.issuer, [Operation.manageSellOffer({ selling: USDC, buying: XLM, amount: "1000", price: "1" })]);

  console.log("Merchant, wallets, verification…");
  const api = new Api();
  const email = `scenario-${Date.now()}@example.com`;
  await api.ok("POST", "/auth/signup", { email, password: "scenario password 123", businessName: "Scenario Shop" });
  async function addWallet(key: Keypair): Promise<string> {
    const added = await api.ok<{ wallet: { id: string } }>("POST", "/v1/wallets", { address: key.publicKey() });
    const ch = await api.ok<{ challengeId: string; message: string }>("POST", `/v1/wallets/${added.wallet.id}/challenge`);
    const signature = Buffer.from(key.signMessage(ch.message)).toString("base64");
    await api.ok("POST", `/v1/wallets/${added.wallet.id}/verify`, { challengeId: ch.challengeId, signature });
    return added.wallet.id;
  }
  const walletId = await addWallet(walletKey);
  await api.ok("PUT", "/v1/pricing", { fixedRate: RATE, defaultMode: "FIXED_RATE" });

  // A second, unrelated merchant: the "incorrect recipient" case pays their reference to our wallet.
  const otherApi = new Api();
  await otherApi.ok("POST", "/auth/signup", { email: `scenario-other-${Date.now()}@example.com`, password: "scenario password 123", businessName: "Other Shop" });
  const otherAdded = await otherApi.ok<{ wallet: { id: string } }>("POST", "/v1/wallets", { address: otherWalletKey.publicKey() });
  const otherCh = await otherApi.ok<{ challengeId: string; message: string }>("POST", `/v1/wallets/${otherAdded.wallet.id}/challenge`);
  await otherApi.ok("POST", `/v1/wallets/${otherAdded.wallet.id}/verify`, { challengeId: otherCh.challengeId, signature: Buffer.from(otherWalletKey.signMessage(otherCh.message)).toString("base64") });
  const otherWalletId = otherAdded.wallet.id;

  let currentCase = "setup";
  const evidenceRequests = new Map<string, EvidenceRequest>();
  const evidenceTxs: EvidenceTx[] = [];
  const track = (r: Req, caseId: string, owner = "Scenario Shop"): Req => {
    evidenceRequests.set(r.id, { caseId, owner, publicId: r.publicId, reference: r.reference, wallet: r.wallet, zarAmount: r.zarAmount, usdcAmount: r.usdcAmount, pricing: r.pricing, expiresAt: r.expiresAt, paymentUrl: r.paymentUrl, status: r.status, paidTxHash: r.paidTxHash });
    return r;
  };
  /** A ZAR request priced at the fixed rate: R92.50 = 5.00 USDC unless told otherwise. */
  const newRequest = async (zarAmount = "92.50", extra: Record<string, unknown> = {}): Promise<Req> => {
    const res = await api.ok<{ request: Req }>("POST", "/v1/payment-requests", { walletId, zarAmount, ...extra });
    return track(res.request, currentCase);
  };
  const probe = await newRequest("18.50");
  if (probe.asset.issuer !== keys.issuer.publicKey()) {
    throw new Error(
      `The API's USDC_ISSUER is ${probe.asset.issuer}, not the scenario issuer.\n` +
        `Set USDC_ISSUER=${keys.issuer.publicKey()} in .env and restart the API and worker.`,
    );
  }
  await api.ok("POST", `/v1/payment-requests/${probe.id}/cancel`);
  evidenceRequests.delete(probe.id);
  if (probe.usdcAmount !== "1.0000000" || probe.pricing.rate !== "18.5000") throw new Error(`fixed-rate pricing gave ${probe.usdcAmount} at ${probe.pricing.rate}`);

  /** Waits until the request has the status and the payment from `txHash` has the outcome. */
  const expectRequest = (id: string, status: string, txHash: string | null, outcome: string | null, client: Api = api) =>
    until(`request ${status}${outcome ? ` / ${outcome}` : ""}`, async () => {
      const d = await client.ok<Detail>("GET", `/v1/payment-requests/${id}`);
      if (d.request.status !== status) return null;
      if (txHash && outcome && !d.payments.some((p) => (p.txHash === txHash || p.innerTxHash === txHash) && p.outcome === outcome)) return null;
      const seen = evidenceRequests.get(id);
      if (seen) Object.assign(seen, { status: d.request.status, paidTxHash: d.request.paidTxHash });
      return d;
    });
  /** Records a real transaction for the evidence file. */
  const evidence = (hash: string, what: string, outcome: string, requestId: string | null) => {
    evidenceTxs.push({ caseId: currentCase, hash, what, outcome, request: requestId ? (evidenceRequests.get(requestId)?.publicId ?? null) : null });
  };
  const expectUnmatched = (txHash: string, outcome: string) =>
    until(`unmatched ${outcome}`, async () => {
      const list = await api.ok<{ data: { txHash: string; outcome: string; eventId: string }[] }>("GET", "/v1/payments?unmatched=true&limit=100");
      return list.data.find((p) => p.txHash === txHash && p.outcome === outcome) ?? null;
    });
  const expectNothing = async (txHash: string) => {
    await sleep(20_000);
    const list = await api.ok<{ data: { txHash: string }[] }>("GET", "/v1/payments?limit=100");
    if (list.data.some((p) => p.txHash === txHash)) throw new Error("a payment was recorded for a failed transaction");
  };

  const results: { id: string; ok: boolean; note: string }[] = [];
  async function run(id: string, title: string, fn: () => Promise<void>): Promise<void> {
    if (only && !only.has(id)) return;
    process.stdout.write(`${id}: ${title} … `);
    currentCase = id;
    try {
      await fn();
      results.push({ id, ok: true, note: title });
      console.log("ok");
    } catch (err) {
      results.push({ id, ok: false, note: `${title}: ${(err as Error).message}` });
      console.log(`FAILED\n    ${(err as Error).message}`);
    }
  }
  const text = (memo: string) => ({ memo: Memo.text(memo) });

  // ---- David's checklist (D) first, then the wider verification cases (P, T). ----

  await run("D1", "R92.50 at R18.50 -> 5.00 USDC; exact payment is detected, verified and PAID with its tx hash", async () => {
    const r = await newRequest("92.50");
    if (r.usdcAmount !== "5.0000000" || r.zarAmount !== "92.50") throw new Error(`priced ${r.zarAmount} -> ${r.usdcAmount}`);
    const page = await fetch(`${API}/public/pay/${r.publicId}`).then((res) => res.json() as Promise<{ zarAmount: string; usdcAmount: string; network: string; reference: string; wallet: string }>);
    if (page.zarAmount !== "92.50" || page.usdcAmount !== "5.0000000" || page.network !== "Stellar Testnet" || page.reference !== r.reference || page.wallet !== wallet) {
      throw new Error(`payment page shows ${JSON.stringify(page)}`);
    }
    const hash = await submit(payer, [pay(wallet, USDC, "5")], text(r.reference));
    evidence(hash, "5 USDC with the right reference", "COUNTED", r.id);
    const d = await expectRequest(r.id, "PAID", hash, "COUNTED");
    if (d.request.paidTxHash !== hash) throw new Error("paidTxHash mismatch");
    const paidPage = await fetch(`${API}/public/pay/${r.publicId}`).then((res) => res.json() as Promise<{ status: string; paidTxHash: string }>);
    if (paidPage.status !== "PAID" || paidPage.paidTxHash !== hash) throw new Error("payment page does not show the verified hash");
  });
  await run("D2", "two partial payments: PARTIALLY_PAID, then PAID on the exact sum", async () => {
    const r = await newRequest("250.00", { pricingMode: "MANUAL", usdcAmount: "13.50" });
    const first = await submit(payer, [pay(wallet, USDC, "5")], text(r.reference));
    evidence(first, "5 of 13.50 USDC", "COUNTED", r.id);
    await expectRequest(r.id, "PARTIALLY_PAID", first, "COUNTED");
    const second = await submit(payer, [pay(wallet, USDC, "8.5")], text(r.reference));
    evidence(second, "the remaining 8.50 USDC", "COUNTED", r.id);
    const d = await expectRequest(r.id, "PAID", second, "COUNTED");
    if (d.request.paidTxHash !== second) throw new Error("paidTxHash should be the completing payment");
  });
  await run("D3", "incorrect amount (too little) stays unpaid", async () => {
    const r = await newRequest("185.00"); // 10.00 USDC
    const hash = await submit(payer, [pay(wallet, USDC, "9")], text(r.reference));
    evidence(hash, "9 USDC for a 10 USDC request", "COUNTED (partial)", r.id);
    const d = await expectRequest(r.id, "PARTIALLY_PAID", hash, "COUNTED");
    if (d.request.paidTxHash !== null) throw new Error("a short payment must not set paidTxHash");
  });
  await run("D4", "unsupported asset: XLM, and counterfeit USDC, are rejected; the request stays PENDING", async () => {
    const r = await newRequest();
    const xlm = await submit(payer, [pay(wallet, XLM, "5")], text(r.reference));
    evidence(xlm, "5 XLM with the right reference", "WRONG_ASSET", r.id);
    await expectRequest(r.id, "PENDING", xlm, "WRONG_ASSET");
    const fake = await submit(payer, [pay(wallet, FAKE_USDC, "5")], text(r.reference));
    evidence(fake, "5 \"USDC\" from a fake issuer", "WRONG_ISSUER", r.id);
    await expectRequest(r.id, "PENDING", fake, "WRONG_ISSUER");
  });
  await run("D5", "incorrect recipient: another merchant's reference paid to our wallet is rejected", async () => {
    const res = await otherApi.ok<{ request: Req }>("POST", "/v1/payment-requests", { walletId: otherWalletId, zarAmount: "92.50", usdcAmount: "5" });
    track(res.request, currentCase, "Other Shop");
    const hash = await submit(payer, [pay(wallet, USDC, "5")], text(res.request.reference));
    evidence(hash, "Other Shop's reference, sent to Scenario Shop's wallet", "WRONG_WALLET", res.request.id);
    await expectRequest(res.request.id, "PENDING", hash, "WRONG_WALLET", otherApi);
  });
  await run("D6", "a cancelled (invalid) request cannot be marked paid", async () => {
    const r = await newRequest();
    await api.ok("POST", `/v1/payment-requests/${r.id}/cancel`);
    const hash = await submit(payer, [pay(wallet, USDC, "5")], text(r.reference));
    evidence(hash, "5 USDC to a cancelled request", "AFTER_CANCEL", r.id);
    await expectRequest(r.id, "CANCELLED", hash, "AFTER_CANCEL");
  });
  await run("D7", "duplicate: paying an already-paid request again is DUPLICATE; the status does not change", async () => {
    const r = await newRequest();
    const first = await submit(payer, [pay(wallet, USDC, "5")], text(r.reference));
    evidence(first, "5 USDC", "COUNTED", r.id);
    await expectRequest(r.id, "PAID", first, "COUNTED");
    const again = await submit(payer, [pay(wallet, USDC, "5")], text(r.reference));
    evidence(again, "the same 5 USDC again", "DUPLICATE", r.id);
    const d = await expectRequest(r.id, "PAID", again, "DUPLICATE");
    if (d.request.paidTxHash !== first) throw new Error("a duplicate must not replace the verified hash");
    if (d.request.usdcReceived !== "5.0000000") throw new Error(`usdcReceived ${d.request.usdcReceived}`);
  });
  await run("D8", "no endpoint marks a request paid from a claimed hash", async () => {
    const r = await newRequest();
    const someoneElses = evidenceTxs.find((t) => t.outcome === "COUNTED")?.hash ?? "ab".repeat(32);
    for (const path of ["accept", "paid", "mark-paid", "confirm"]) {
      const res = await api.call("POST", `/v1/payment-requests/${r.id}/${path}`, { txHash: someoneElses });
      if (res.status !== 404) throw new Error(`/${path} answered ${res.status}`);
    }
    await expectRequest(r.id, "PENDING", null, null);
  });

  await run("P3", "unknown reference -> UNKNOWN_MEMO, unmatched", async () => {
    const hash = await submit(payer, [pay(wallet, USDC, "1")], text("RDZZZZZZZZ"));
    evidence(hash, "1 USDC with a reference that belongs to no request", "UNKNOWN_MEMO", null);
    await expectUnmatched(hash, "UNKNOWN_MEMO");
  });
  await run("P4", "reference typed lowercase with separators -> COUNTED", async () => {
    const r = await newRequest();
    const typed = `${r.reference.slice(0, 2)}-${r.reference.slice(2, 6)} ${r.reference.slice(6)}`.toLowerCase();
    const hash = await submit(payer, [pay(wallet, USDC, "5")], text(typed));
    evidence(hash, `5 USDC with the reference typed as "${typed}"`, "COUNTED", r.id);
    await expectRequest(r.id, "PAID", hash, "COUNTED");
  });
  await run("P5", "MEMO_ID -> MEMO_TYPE_MISMATCH, unmatched", async () => {
    const hash = await submit(payer, [pay(wallet, USDC, "1")], { memo: Memo.id("12345") });
    evidence(hash, "1 USDC with an unrelated numeric memo", "MEMO_TYPE_MISMATCH", null);
    await expectUnmatched(hash, "MEMO_TYPE_MISMATCH");
  });
  await run("P11", "overpay -> OVERPAID, excess flagged for refund", async () => {
    const r = await newRequest();
    const over = await submit(payer, [pay(wallet, USDC, "6")], text(r.reference));
    evidence(over, "6 USDC for a 5 USDC request", "COUNTED (overpaid)", r.id);
    const d = await expectRequest(r.id, "OVERPAID", over, "COUNTED");
    if (!(d.request as unknown as { refundOwed: boolean }).refundOwed) throw new Error("excess should be flagged");
  });
  await run("P13", "two payment ops in one tx -> both COUNTED, summed", async () => {
    const r = await newRequest();
    const hash = await submit(payer, [pay(wallet, USDC, "2"), pay(wallet, USDC, "3")], text(r.reference));
    evidence(hash, "2 + 3 USDC in one transaction", "COUNTED x2", r.id);
    const d = await expectRequest(r.id, "PAID", hash, "COUNTED");
    if (d.payments.filter((p) => p.txHash === hash && p.outcome === "COUNTED").length !== 2) throw new Error("expected two COUNTED events");
  });
  await run("P14", "path payment XLM -> USDC counted by the USDC received", async () => {
    const r = await newRequest();
    const op = Operation.pathPaymentStrictReceive({ sendAsset: XLM, sendMax: "50", destination: wallet, destAsset: USDC, destAmount: "5", path: [] });
    const hash = await submit(payer, [op], text(r.reference));
    evidence(hash, "path payment: payer sends XLM, wallet receives 5 USDC", "COUNTED", r.id);
    await expectRequest(r.id, "PAID", hash, "COUNTED");
  });
  await run("P15", "Soroban SAC transfer to the request's muxed address -> COUNTED, PAID", async () => {
    // Stands in for a contract wallet: the payment is a contract invocation of the asset
    // contract's `transfer`. Soroban transactions cannot carry a memo, so the payer sends to
    // the request's M… address and the mux id identifies the request.
    const sacId = USDC.contractId(PASSPHRASE);
    try {
      const deployer = await soroban.getAccount(keys.issuer.publicKey());
      const deploy = new TransactionBuilder(deployer, { fee: "10000000", networkPassphrase: PASSPHRASE })
        .addOperation(Operation.createStellarAssetContract({ asset: USDC }))
        .setTimeout(120)
        .build();
      const prepared = await soroban.prepareTransaction(deploy);
      prepared.sign(keys.issuer);
      const sent = await soroban.sendTransaction(prepared);
      await soroban.pollTransaction(sent.hash, { attempts: 30 });
    } catch {
      // already deployed on a previous run
    }
    const r = await newRequest();
    const account = await soroban.getAccount(payer.publicKey());
    const tx = new TransactionBuilder(account, { fee: "10000000", networkPassphrase: PASSPHRASE })
      .addOperation(new Contract(sacId).call("transfer", new Address(payer.publicKey()).toScVal(), new Address(r.muxedAddress).toScVal(), nativeToScVal(50_000_000n, { type: "i128" })))
      .setTimeout(120)
      .build();
    const prepared = await soroban.prepareTransaction(tx);
    prepared.sign(payer);
    const sent = await soroban.sendTransaction(prepared);
    if (sent.status === "ERROR") throw new Error(`sendTransaction rejected: ${JSON.stringify(sent.errorResult)}`);
    await soroban.pollTransaction(sent.hash, { attempts: 30 });
    evidence(sent.hash, "contract transfer of 5 USDC to the request's muxed address", "COUNTED", r.id);
    await expectRequest(r.id, "PAID", sent.hash, "COUNTED");
  });
  await run("P2", "no reference -> NO_MEMO, then the merchant links it (still verified)", async () => {
    const r = await newRequest();
    const hash = await submit(payer, [pay(wallet, USDC, "5")]);
    evidence(hash, "5 USDC with no memo", "NO_MEMO -> linked -> COUNTED", r.id);
    const payment = await expectUnmatched(hash, "NO_MEMO");
    const before = await api.ok<Detail>("GET", `/v1/payment-requests/${r.id}`);
    if (before.request.status !== "PENDING") throw new Error("must not match by amount");
    await api.ok("POST", `/v1/payments/${payment.eventId}/link`, { requestId: r.id });
    await expectRequest(r.id, "PAID", hash, "COUNTED");
  });
  await run("P18", "one stroop short -> PARTIALLY_PAID, never rounded", async () => {
    const r = await newRequest();
    const hash = await submit(payer, [pay(wallet, USDC, "4.9999999")], text(r.reference));
    evidence(hash, "4.9999999 USDC for a 5 USDC request", "COUNTED (partial)", r.id);
    const d = await expectRequest(r.id, "PARTIALLY_PAID", hash, "COUNTED");
    if (d.request.usdcReceived !== "4.9999999") throw new Error(`usdcReceived ${d.request.usdcReceived}`);
  });
  await run("P19", "failed transaction -> nothing recorded", async () => {
    const r = await newRequest();
    // Impossible path payment: fails on-chain (fee charged, no transfer).
    const op = Operation.pathPaymentStrictReceive({ sendAsset: XLM, sendMax: "0.0000001", destination: wallet, destAsset: USDC, destAmount: "5", path: [] });
    const hash = await submit(payer, [op], { ...text(r.reference), allowFailure: true });
    evidence(hash, "a transaction that failed on-chain", "nothing recorded", r.id);
    await expectNothing(hash);
    await expectRequest(r.id, "PENDING", null, null);
  });
  await run("P20", "fee-bump transaction -> COUNTED with both hashes", async () => {
    const r = await newRequest();
    const outer = await submit(payer, [pay(wallet, USDC, "5")], { ...text(r.reference), feeBumpBy: keys.fakeIssuer });
    evidence(outer, "5 USDC inside a fee-bump transaction", "COUNTED", r.id);
    const d = await expectRequest(r.id, "PAID", outer, "COUNTED");
    const p = d.payments.find((x) => x.outcome === "COUNTED");
    if (!p?.innerTxHash || p.innerTxHash === p.txHash) throw new Error("inner hash not stored");
  });
  await run("T7", "expiry outside 5 min - 30 days -> 400", async () => {
    for (const expiresInMinutes of [4, 43_201]) {
      const res = await api.call("POST", "/v1/payment-requests", { walletId, zarAmount: "92.50", expiresInMinutes });
      if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
    }
  });

  if (!args.has("--skip-timing") && !only) {
    // These need a real expiry, and the shortest allowed is 5 minutes.
    currentCase = "T1";
    const t1 = await newRequest("92.50", { expiresInMinutes: 5 });
    currentCase = "D9";
    const t2 = await newRequest("92.50", { expiresInMinutes: 5 });
    currentCase = "T3";
    const t3 = await newRequest("92.50", { expiresInMinutes: 5 });
    await run("T1", "paid before expiry -> PAID (and stays PAID after expiry)", async () => {
      const hash = await submit(payer, [pay(wallet, USDC, "5")], text(t1.reference));
      evidence(hash, "5 USDC before expiry", "COUNTED", t1.id);
      await expectRequest(t1.id, "PAID", hash, "COUNTED");
    });
    currentCase = "T3";
    const partial = await submit(payer, [pay(wallet, USDC, "2")], text(t3.reference));
    evidence(partial, "2 of 5 USDC before expiry", "COUNTED (partial)", t3.id);
    await expectRequest(t3.id, "PARTIALLY_PAID", partial, "COUNTED");
    console.log("Waiting about 5.5 minutes for requests to expire…");
    await sleep(5.5 * 60_000);
    await run("T3", "partial, then expiry -> EXPIRED with the amount received", async () => {
      const d = await expectRequest(t3.id, "EXPIRED", null, null);
      if (d.request.usdcReceived !== "2.0000000") throw new Error(`usdcReceived ${d.request.usdcReceived}`);
    });
    await run("D9", "an expired request cannot be marked paid: a late payment is LATE and it stays EXPIRED", async () => {
      const hash = await submit(payer, [pay(wallet, USDC, "5")], text(t2.reference));
      evidence(hash, "5 USDC after the request expired", "LATE", t2.id);
      await expectRequest(t2.id, "EXPIRED", hash, "LATE");
      await sleep(10_000);
      await expectRequest(t2.id, "EXPIRED", null, null);
    });
    await run("T1b", "request paid before expiry is still PAID", async () => {
      await expectRequest(t1.id, "PAID", null, null);
    });
  }

  console.log("\nResults");
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id}  ${r.note}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed. Merchant login: ${email}`);

  if (!only) {
    writeEvidence(EVIDENCE_FILE, {
      api: API,
      merchantEmail: email,
      rate: RATE,
      usdcIssuer: keys.issuer.publicKey(),
      results,
      requests: [...evidenceRequests.values()],
      transactions: evidenceTxs,
    });
    console.log(`Evidence written to ${EVIDENCE_FILE}`);
  }
  if (failed.length > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
