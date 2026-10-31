// End-to-end walkthrough against a local API + worker + web on Stellar Testnet.
//
//   node e2e/walkthrough.mjs            (from apps/web, with `pnpm dev`, `pnpm dev:worker` and the web app running)
//
// A brand-new merchant signs up, connects a wallet, sets a rate and creates a request using the
// UI; a customer opens the payment link logged out and pays it with a real Testnet transaction;
// the page must flip to Paid by itself (F1, F2, F11, F13). Screenshots go to e2e/shots.
//
// Wallet ownership is proved through the API with a SEP-53 signature from a throwaway key,
// exactly what Freighter produces, because a headless browser can't load the extension. The
// customer's payment is sent from Node for the same reason. Keys are generated per run and
// never printed; the USDC issuer's key comes from .scenario-keys.json (gitignored).

import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Asset, BASE_FEE, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { chromium } from "playwright-core";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:4300";
const HORIZON = "https://horizon-testnet.stellar.org";
const ROOT = new URL("../../../", import.meta.url).pathname;
const SHOTS = new URL("./shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const keys = JSON.parse(readFileSync(join(ROOT, ".scenario-keys.json"), "utf8"));
const issuer = Keypair.fromSecret(keys.issuer);
if (issuer.publicKey() !== env.USDC_ISSUER) throw new Error("The API's USDC_ISSUER is not the scenario issuer; run the scenario setup first.");
const USDC = new Asset("USDC", issuer.publicKey());
const horizon = new Horizon.Server(HORIZON);

const results = [];
/** Every page opened, so a failure can be photographed. */
const openPages = [];
const check = (id, name, ok, detail = "") => {
  results.push({ id, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name}${detail ? ` · ${detail}` : ""}`);
};

async function friendbot(address) {
  for (let i = 0; i < 5; i += 1) {
    const res = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    if (res.ok || res.status === 400) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Friendbot failed");
}

async function submit(source, ops, memo) {
  const account = await horizon.loadAccount(source.publicKey());
  let builder = new TransactionBuilder(account, { fee: String(Number(BASE_FEE) * 10), networkPassphrase: Networks.TESTNET }).setTimeout(120);
  for (const op of ops) builder = builder.addOperation(op);
  if (memo) builder = builder.addMemo(Memo.text(memo));
  const tx = builder.build();
  tx.sign(source);
  const res = await horizon.submitTransaction(tx);
  return res.hash;
}

function chromePath() {
  const base = join(homedir(), "Library/Caches/ms-playwright");
  for (const dir of ["chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell"]) {
    try {
      readFileSync(join(base, dir), { flag: "r" });
      return join(base, dir);
    } catch {
      // try the next one
    }
  }
  return process.env.CHROME_PATH;
}

async function main() {
  console.log("Setting up Testnet accounts…");
  const merchantKey = Keypair.random();
  const customerKey = Keypair.random();
  await Promise.all([friendbot(merchantKey.publicKey()), friendbot(customerKey.publicKey())]);
  await submit(merchantKey, [Operation.changeTrust({ asset: USDC })]);
  await submit(customerKey, [Operation.changeTrust({ asset: USDC })]);
  await submit(issuer, [Operation.payment({ destination: customerKey.publicKey(), asset: USDC, amount: "50" })]);

  const browser = await chromium.launch({ executablePath: chromePath() });
  const merchantCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await merchantCtx.newPage();
  openPages.push(page);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Landing
  await page.goto(WEB);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.screenshot({ path: `${SHOTS}01-landing.png` });
  check("F11", "Landing shows the Testnet notice", (await page.getByText("Stellar Testnet only").count()) > 0);

  // Sign up
  const email = `e2e-${Date.now()}@randi.test`;
  await page.goto(`${WEB}/signup`);
  await page.getByLabel("Business name").fill("Mama Tee's Kitchen");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.screenshot({ path: `${SHOTS}02-signup.png` });
  await page.getByRole("button", { name: "Create account" }).last().click();
  await page.waitForURL("**/get-started");
  await page.getByText("Two things, then you're live.").waitFor();
  await page.screenshot({ path: `${SHOTS}03-get-started.png` });
  check("M-UI", "Sign-up lands on the setup checklist", true);

  // Connect dialog opens and offers the wallets (the extension itself can't run headless).
  await page.getByRole("button", { name: /Connect your wallet/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByText("Paste an address instead").waitFor();
  await page.getByText("Paste an address instead").click();
  await page.getByLabel("Stellar address").fill("S".padEnd(56, "A"));
  const secretWarned = await page.getByText("That's a secret key. Never share it.").isVisible();
  check("F9", "A pasted secret key is caught before it is sent", secretWarned);
  await page.screenshot({ path: `${SHOTS}04-secret-guard.png` });
  await page.getByLabel("Stellar address").fill(merchantKey.publicKey());
  await page.getByLabel("Name (optional)").fill("Main till");
  await page.getByRole("button", { name: "Add wallet" }).click();
  await page.getByText("Account exists on Testnet").waitFor();
  await page.screenshot({ path: `${SHOTS}05-wallet-checks.png` });
  await page.getByRole("button", { name: "Done" }).click();

  // Prove ownership with a SEP-53 signature (what Freighter's signMessage returns).
  const headers = { Origin: WEB, "Content-Type": "application/json" };
  const wallets = await (await page.request.get(`${API}/v1/wallets`)).json();
  const wallet = wallets.data.find((w) => w.address === merchantKey.publicKey());
  const challengeRes = await page.request.post(`${API}/v1/wallets/${wallet.id}/challenge`, { headers });
  if (!challengeRes.ok()) console.log("challenge:", challengeRes.status(), await challengeRes.text());
  const challenge = await challengeRes.json();
  const signature = Buffer.from(merchantKey.signMessage(challenge.message)).toString("base64");
  const verified = await page.request.post(`${API}/v1/wallets/${wallet.id}/verify`, { headers, data: { challengeId: challenge.challengeId, signature } });
  if (!verified.ok()) console.log("verify:", verified.status(), await verified.text());
  check("W-UI", "Wallet verified with a SEP-53 signature", verified.ok());
  await page.request.post(`${API}/auth/settings`, { headers, data: { defaultWalletId: wallet.id } });

  // Set the rate in Settings.
  await page.goto(`${WEB}/settings`);
  await page.getByRole("tab", { name: "Pricing" }).click();
  await page.getByLabel("Your rate").fill("18.50");
  await page.getByText("R500.00 asks for 27.03 USDC").waitFor();
  await page.getByRole("button", { name: "Use my fixed rate" }).click();
  await page.getByRole("button", { name: "Save pricing" }).click();
  await page.getByText("Pricing saved").waitFor();
  await page.screenshot({ path: `${SHOTS}06-settings-pricing.png` });

  // New request in fixed-rate mode: the preview equals what is saved (F8).
  await page.goto(`${WEB}/requests/new`);
  await page.getByLabel("Amount in rand").fill("92.50");
  await page.getByLabel("Description (optional)").fill("Jollof and chicken");
  await page.getByLabel("Order number (optional)").fill("1042");
  await page.getByText("For R92.50 at your rate").waitFor();
  const previewText = await page.locator(".big-figure").innerText();
  await page.screenshot({ path: `${SHOTS}07-new-request.png` });
  await page.getByRole("button", { name: "Create request" }).click();
  await page.waitForURL(/\/requests\/[^/]+\?share=1/);
  await page.getByText("Share with your customer").waitFor();
  const requestId = new URL(page.url()).pathname.split("/").pop();
  const detail = await (await page.request.get(`${API}/v1/payment-requests/${requestId}`)).json();
  const req = detail.request;
  check("F8", "Fixed-rate preview equals the saved USDC", previewText.startsWith("5.00") && req.usdcAmount.startsWith("5.0000000"), `${previewText.split("\n")[0]} vs ${req.usdcAmount}`);
  await page.screenshot({ path: `${SHOTS}08-request-detail.png`, fullPage: true });

  // The customer opens the link, logged out, on a phone.
  const customerCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pay = await customerCtx.newPage();
  openPages.push(pay);
  pay.on("pageerror", (e) => errors.push(`pay: ${e.message}`));
  await pay.goto(req.paymentUrl);
  await pay.getByText("Waiting for your payment").waitFor();
  await pay.getByRole("button", { name: "Pay from any other wallet" }).click();
  const body = await pay.locator("main").innerText();
  const f1 = ["R92.50", "5.00", "Stellar Testnet", "USDC", req.reference, "Waiting for your payment", "memo"].every((s) => body.includes(s)) && body.includes(req.wallet);
  check("F1", "Payment page shows ZAR, USDC, network, asset, address, reference, instructions, status", f1);
  check("F13", "Payment page works logged out and shows no merchant data beyond the allowed fields", !body.includes(email));
  check("F11", "Testnet banner on the payment page", await pay.getByText("Stellar Testnet · test money, no real value").isVisible());
  await pay.screenshot({ path: `${SHOTS}09-pay-waiting.png`, fullPage: true });

  // Pay it for real, then watch the page flip without a reload (F2).
  const hash = await submit(customerKey, [Operation.payment({ destination: merchantKey.publicKey(), asset: USDC, amount: "5.00" })], req.reference);
  console.log(`Sent 5.00 USDC · tx ${hash.slice(0, 8)}…`);
  const t0 = Date.now();
  await pay.getByText("Paid.").waitFor({ timeout: 180_000 });
  const secs = Math.round((Date.now() - t0) / 1000);
  const paidText = await pay.locator("main").innerText();
  check("F2", "Payment page flips to Paid with the tx hash, no reload", paidText.includes(hash), `${secs}s after submit`);
  await pay.screenshot({ path: `${SHOTS}10-pay-paid.png`, fullPage: true });

  // The merchant sees it everywhere.
  await page.goto(`${WEB}/requests`);
  await page.getByText("Jollof and chicken").first().waitFor();
  const listText = await page.locator("table").innerText();
  check("D1-UI", "Requests list shows Paid with the hash", listText.includes("Paid") && listText.includes(hash.slice(0, 6)));
  await page.screenshot({ path: `${SHOTS}11-requests.png` });
  await page.goto(`${WEB}/overview`);
  await page.getByText("Received this month").waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}12-overview.png` });
  await page.getByRole("button", { name: "Hide amounts" }).click();
  check("UI", "Hide amounts masks the total", (await page.locator(".big-figure").innerText()).includes("••••••"));
  await page.getByRole("button", { name: "Show amounts" }).click();
  await page.goto(`${WEB}/payments`);
  await page.getByText("Applied").first().waitFor();
  await page.screenshot({ path: `${SHOTS}13-payments.png` });
  await page.goto(`${WEB}/wallets`);
  await page.getByText("Main till").waitFor();
  await page.screenshot({ path: `${SHOTS}14-wallets.png` });

  // Phone views of the dashboard (bottom tab bar, stacked rows with the hash: F10).
  const phone = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await merchantCtx.storageState() });
  const m = await phone.newPage();
  openPages.push(m);
  m.on("pageerror", (e) => errors.push(`phone: ${e.message}`));
  await m.goto(`${WEB}/overview`);
  await m.getByText("Received this month").waitFor();
  await m.waitForTimeout(1200);
  await m.screenshot({ path: `${SHOTS}15-phone-overview.png` });
  await m.goto(`${WEB}/requests`);
  await m.locator(".only-narrow").getByText("Jollof and chicken").waitFor();
  const scrollW = await m.evaluate(() => document.documentElement.scrollWidth);
  const mobileText = await m.locator(".only-narrow").innerText();
  check("F10", "Requests at 360 px: stacked rows, tx hash visible, no sideways scroll", scrollW <= 360 && mobileText.includes(hash.slice(0, 6)), `scrollWidth ${scrollW}`);
  await m.screenshot({ path: `${SHOTS}16-phone-requests.png` });
  await m.goto(`${WEB}/requests/new`);
  await m.getByLabel("Amount in rand").waitFor();
  await m.screenshot({ path: `${SHOTS}17-phone-new.png` });

  // Another merchant can't open this request (F12).
  const other = await browser.newContext();
  const o = await other.newPage();
  openPages.push(o);
  await o.goto(`${WEB}/signup`);
  await o.getByLabel("Business name").fill("Other Shop");
  await o.getByLabel("Email").fill(`e2e-other-${Date.now()}@randi.test`);
  await o.getByLabel("Password").fill("correct-horse-battery");
  await o.getByRole("button", { name: "Create account" }).last().click();
  await o.waitForURL("**/get-started");
  await o.goto(`${WEB}/requests/${requestId}`);
  await o.getByText("We can't find this request").waitFor();
  check("F12", "Merchant B opening Merchant A's request sees Not found", true);

  check("UI", "No uncaught errors in the browser", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err.message.split("\n")[0]);
  for (const [i, p] of openPages.entries()) await p.screenshot({ path: `${SHOTS}fail-${i}.png` }).catch(() => undefined);
  process.exit(1);
});
