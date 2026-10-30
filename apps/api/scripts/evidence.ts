import { writeFileSync } from "node:fs";

export interface EvidenceRequest {
  caseId: string;
  owner: string;
  publicId: string;
  reference: string;
  wallet: string;
  zarAmount: string;
  usdcAmount: string;
  pricing: { mode: string; rate: string | null };
  expiresAt: string;
  paymentUrl: string;
  status: string;
  paidTxHash: string | null;
}

export interface EvidenceTx {
  caseId: string;
  hash: string;
  what: string;
  outcome: string;
  /** publicId of the request it was meant for, if any. */
  request: string | null;
}

export interface EvidenceRun {
  api: string;
  merchantEmail: string;
  rate: string;
  usdcIssuer: string;
  results: { id: string; ok: boolean; note: string }[];
  requests: EvidenceRequest[];
  transactions: EvidenceTx[];
}

/** David's checklist, and the scenario cases that prove each line. */
const CHECKLIST: { item: string; cases: string[] }[] = [
  { item: "At least three payment requests can be created successfully", cases: ["D1", "D2", "D3"] },
  { item: "Each request has a unique payment ID, payment reference, recipient address, amount, expiry and status", cases: ["D1"] },
  { item: "A merchant can share a payment page with a customer", cases: ["D1"] },
  { item: "At least five actual Stellar Testnet payment transactions are completed successfully", cases: ["D1", "D2", "D7", "P4", "P13"] },
  { item: "The system automatically detects a valid payment and marks the request Paid", cases: ["D1", "D2"] },
  { item: "Each verified payment has a transaction hash linked to the correct payment request", cases: ["D1", "D2", "D7"] },
  { item: "A transaction with an incorrect amount is rejected or remains unpaid", cases: ["D3", "P18"] },
  { item: "An invalid or expired payment request cannot be incorrectly marked as paid", cases: ["D6", "D8", "D9"] },
  { item: "Duplicate transaction events do not result in duplicate payment recognition", cases: ["D7"] },
  { item: "Payments in an unsupported asset or to an incorrect recipient are rejected", cases: ["D4", "D5"] },
  { item: "The complete flow can be demonstrated from creation through verification and confirmation", cases: ["D1"] },
];

const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
const txLink = (hash: string) => `[${short(hash)}](https://stellar.expert/explorer/testnet/tx/${hash})`;

/** Writes docs/Evidence.md from a scenario run on Stellar Testnet. */
export function writeEvidence(file: string, run: EvidenceRun): void {
  const passed = new Map(run.results.map((r) => [r.id, r.ok]));
  const status = (ids: string[]) => {
    const ran = ids.filter((id) => passed.has(id));
    if (ran.length === 0) return "not run";
    return ran.every((id) => passed.get(id)) ? "PASS" : "FAIL";
  };
  const lines: string[] = [
    "# Randi — Testnet evidence",
    "",
    `Generated ${new Date().toISOString()} by \`pnpm scenario\` against ${run.api}. Stellar **Testnet** only: no real money.`,
    "",
    `- Merchant: ${run.merchantEmail} · fixed rate **R${run.rate} = 1 USDC** (set by the merchant, not a live exchange rate)`,
    `- USDC issuer for this run: \`${run.usdcIssuer}\`. The scenario issues its own testnet USDC so it can fund the payer; in normal use Randi is configured with Circle's testnet issuer. A payment in USDC from any other issuer is rejected as counterfeit (case D4).`,
    `- ${run.requests.length} payment requests created · ${run.transactions.length} real Testnet transactions sent`,
    "",
    "## David's checklist",
    "",
    "| Requirement | Proven by | Result |",
    "| --- | --- | --- |",
    ...CHECKLIST.map((c) => `| ${c.item} | ${c.cases.join(", ")} | ${status(c.cases)} |`),
    "",
    "## Every case",
    "",
    "| Case | What it checks | Result |",
    "| --- | --- | --- |",
    ...run.results.map((r) => `| ${r.id} | ${r.note.replace(/\|/g, "\\|")} | ${r.ok ? "PASS" : "FAIL"} |`),
    "",
    "## Payment requests",
    "",
    "| Case | Merchant | Request ID | Reference | Recipient | ZAR | USDC | Pricing | Expires | Final status | Verified tx |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...run.requests.map(
      (r) =>
        `| ${r.caseId} | ${r.owner} | [${r.publicId}](${r.paymentUrl}) | \`${r.reference}\` | \`${short(r.wallet)}\` | R${r.zarAmount} | ${r.usdcAmount} | ${r.pricing.mode === "FIXED_RATE" ? `fixed R${r.pricing.rate}` : "manual"} | ${r.expiresAt} | ${r.status} | ${r.paidTxHash ? txLink(r.paidTxHash) : "—"} |`,
    ),
    "",
    "## Testnet transactions",
    "",
    "| Case | Transaction | What was sent | Randi's outcome | For request |",
    "| --- | --- | --- | --- | --- |",
    ...run.transactions.map((t) => `| ${t.caseId} | ${txLink(t.hash)} | ${t.what} | ${t.outcome} | ${t.request ?? "—"} |`),
    "",
  ];
  writeFileSync(file, lines.join("\n"));
}
