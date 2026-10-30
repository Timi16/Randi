# Randi — Build Plan

30 Oct 2026 · @Timmy

The spec is [Architecture.md](Architecture.md), [Backend.md](Backend.md) and [Frontend.md](Frontend.md).
This doc sets the build order, the gate each phase must pass, and how we prove David's checklist.

## 1. Working rules (for whoever builds it, including Claude Code)

1. Follow the docs. If something is unclear or seems wrong, ask before building. If a change is agreed, update the matching doc in the same commit.
2. One phase at a time, in order. A phase is done only when its gate passes.
3. TypeScript strict; no `any`.
4. Money is never a float: integer cents (ZAR) and stroops (USDC) in code and database, decimal strings in JSON. `parseFloat`/`Number()` on amounts banned by lint.
5. A request's status changes only in `transitionRequest`, under a row lock, checked against the allowed table.
6. Only the worker can make a request Paid, and only from a transaction it read from Stellar.
7. Expiry is judged by ledger close time.
8. A payment reference is never reused.
9. ZAR is display-only; verification compares USDC stroops only. No FX or price API, ever.
10. Never store or log a Stellar secret key, password, session token or cookie.
11. Testnet only: refuse to boot on any other network.
12. Every test ID in the docs (Z, P, T, M, C, S, F) has at least one test named with it; scenario cases (D, P, T) run on Testnet.
13. Before calling a task done: lint, typecheck and tests pass, and the results are reported.

## 2. Approach

Started from **PayLink's codebase** (done 30 Oct 2026; the backend is in `apps/api`), then:

- **Remove:** XLM as a payment asset, API keys, merchant Accept, auto-match by amount.
- **Rename:** `PL` → `RD` memo prefix, cookies `rd_*`, ports 4300 / 5438.
- **Add:** ZAR amount, pricing modes and fixed rate, `FAILED` status, linking rules, evidence script, new design system.

This keeps the proven engine (detection, matching, expiry, duplicates) and spends the effort on what's new.

## 3. Phases

| Phase | What | Gate check |
| --- | --- | --- |
| **0. Foundation** | Workspace (api, web, shared), strict TS, lint money rules, Postgres in Docker, schema + first migration, `/health`, env validation (Testnet only), CI (lint → typecheck → test), design tokens in `apps/web/DESIGN.md` | CI green; `/health` returns DB status locally and on the server |
| **1. Stellar engine** | Event source (RPC) + backfill (Horizon), decoder, watched wallets, ingestion loop with cursor, reconciliation, watchdog, reset detection | 20 Testnet payments to a watched wallet → exactly 20 payment rows; kill the worker mid-run, restart → still 20 |
| **2. Requests, pricing, verification** | Auth, wallets (checks + Freighter proof), pricing settings + quote, create/list/detail/cancel, references, `transitionRequest`, matcher with every outcome, expiry sweeper, unmatched + link, refund flags, live streams | Unit + integration tests for Z, P, T, W, C, S pass; scenario script runs the ★ cases on Testnet and each ends in the expected status/outcome |
| **3. Customer payment page** | `/pay/[requestId]` per Frontend §6: amount pair, instructions, QR (SEP-7), Pay with Freighter, every state, live status | On a phone: open a shared link, pay with a Testnet wallet, page flips to Paid with the tx hash without refreshing |
| **4. Merchant dashboard** | Onboarding, overview, requests list/new/detail with share panel, payments + unmatched, wallets, settings with pricing | A brand-new merchant goes from sign-up to a paid request using only the UI |
| **5. Evidence and handover** | Scenario on the live deployment, `docs/Evidence.md` generated, monitoring + alerts, backups, README/runbook, demo recording | Section 5 (Definition of done) fully ticked |

## 4. The demo scenario (David's proof)

`pnpm scenario` runs this on **Stellar Testnet** against a running API and worker and writes
`docs/Evidence.md`: David's checklist with PASS/FAIL, each request (ID, reference, recipient, ZAR,
USDC, pricing, expiry, final status, verified hash) and each transaction (hash with a stellar.expert
link, what was sent, Randi's outcome).

Setup: merchant "Scenario Shop" with a verified wallet and a fixed rate of R18.50 (so R92.50 asks for
5.00 USDC); an unrelated merchant "Other Shop" with its own wallet; a customer account funded by
Friendbot. The scenario issues its own testnet USDC so it can fund the customer (the API runs with that
issuer); a second issuer provides counterfeit "USDC". In normal use Randi is configured with Circle's
testnet issuer.

| Case | Request | Customer action (real Testnet tx) | Expected result | Proves David's item |
| --- | --- | --- | --- | --- |
| D1 | R92.50 → 5.00 USDC (fixed rate) | Checks the payment page, pays 5 USDC with the reference | **Paid**, page shows the hash | Create, share, detect, verify, Paid, hash linked |
| D2 | R250.00 + 13.50 USDC (manual) | Pays 5.00, then 8.50 | Part-paid → **Paid** (hash of the completing tx) | Partial handling; hash linked |
| D3 | R185.00 → 10.00 USDC | Pays 9.00 | **Part-paid**, never Paid | Incorrect amount remains unpaid |
| D4 | R92.50 → 5.00 USDC | Pays 5 **XLM**, then 5 counterfeit "USDC" | **Wrong asset**, **counterfeit**; stays Pending | Unsupported asset rejected |
| D5 | Other Shop's request | Pays its reference to Scenario Shop's wallet | **Wrong recipient**; stays Pending | Incorrect recipient rejected |
| D6 | Cancelled request | Pays it | Stays **Cancelled** (after cancel) | Invalid request can't be marked Paid |
| D7 | R92.50 → 5.00 USDC | Pays, then pays again | **Paid**, then **duplicate**; hash and amount unchanged | Duplicates not recognised twice |
| D8 | Pending request | Calls accept / paid / mark-paid / confirm with a real hash | 404; stays Pending | Not Paid on a claim |
| D9 | 5-minute expiry | Waits for expiry, then pays | Stays **Expired**, payment **late** | Expired can't be marked Paid |

It then runs the wider cases on Testnet (P2–P5, P11, P13–P15, P18–P20, T1, T3, T7). In total **20 requests** and **24 real Testnet transactions** (first full run, 30 Oct 2026: 24/24 cases passed) (≥3 and ≥5 required). The worker's restart and
replay safety (duplicate *events*, not just duplicate payments) is proven by tests S1, S4 and C8.

## 5. Definition of done

Ticked on the **live deployment**, not just locally.

**David's checklist**
- [ ] At least three payment requests created successfully
- [ ] Each has a unique request ID, payment reference, recipient address, ZAR + USDC amount, expiry and status
- [ ] A merchant can share a payment page with a customer (link, WhatsApp, QR)
- [ ] At least five real Stellar Testnet payment transactions completed
- [ ] A valid payment is detected automatically and its request marked Paid
- [ ] Each verified payment has its tx hash linked to the correct request
- [ ] An incorrect amount remains unpaid
- [ ] An invalid or expired request cannot be marked Paid
- [ ] Duplicate transaction events don't cause duplicate recognition
- [ ] Unsupported asset and incorrect recipient are rejected
- [ ] Full flow demonstrated from creation through verification and confirmation

**Engineering**
- [ ] Every test ID (Z, P, T, W, C, S, F) has a passing test named with it
- [ ] Lint, typecheck and tests green in CI on main
- [ ] Worker kill / RPC outage / DB outage drills pass: nothing missed or double-counted
- [ ] Security checklist (Backend §13) fully ticked
- [ ] HTTPS, monitoring, alerts and nightly backups running; one restore tested
- [ ] `docs/Evidence.md` generated from the live run
- [ ] README: setup, env vars, deploy, runbook

## 6. Rough timeline (reusing PayLink)

| Day | Work |
| --- | --- |
| 1 | Phase 0 + fork/trim PayLink |
| 2 | Phase 1 (verify engine on Testnet) + Phase 2 pricing and ZAR |
| 3 | Phase 2 matcher changes, statuses, tests |
| 4 | Phase 3 payment page |
| 5 | Phase 4 dashboard |
| 6 | Phase 5 evidence run, demo, handover |
