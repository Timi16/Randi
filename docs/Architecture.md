# Randi — Architecture

30 Oct 2026 · @Timmy · Draft for review with David (Stellar)

## 1. What Randi is

A **payment-request** product for South African businesses. Money moves **in**, from a customer to a business.

1. A merchant creates a request priced in rand, for example *"R500.00 for Order #1042"*.
2. Randi works out how much **USDC** the customer must send. The merchant either types the USDC amount or Randi uses the merchant's **fixed rate**.
3. Randi gives the request a **request ID**, a **payment reference** and a **shareable link**.
4. The customer opens the link (no account needed) and pays the USDC on **Stellar Testnet** from their own wallet.
5. Randi watches the merchant's wallet on Stellar, **verifies** the real transaction, and marks the request **Paid** with the transaction hash.

Randi is **not** a store checkout (there's no cart and no store plugin), **not** payroll (money doesn't go out), and **not** an exchange (no live FX, no fiat settlement, no bank payouts).

## 2. Where this design comes from

Randi's engine is the design of **PayLink**, our live Stellar Testnet payment-request app (paylink.ink). PayLink already solves the hard parts David lists: detecting payments, matching them to requests, rejecting wrong ones, never counting twice, and expiring safely. Randi reuses that design and changes the parts below.

| | What changes in Randi |
| --- | --- |
| **New** | ZAR amount on every request, shown next to the USDC amount |
| **New** | Pricing: the merchant enters both amounts (manual) or sets a fixed ZAR-per-USDC rate. Each request keeps a copy of the rate it was created with |
| **New** | A `FAILED` request status, as named in the brief (used when a request can no longer be paid, e.g. a Testnet reset) |
| **New** | A demo-evidence file listing every real Testnet transaction, mapped to David's checklist |
| **Removed** | XLM as a payment asset. Randi accepts **USDC only** |
| **Removed** | Merchant "Accept" of underpaid or late payments. **Only the verifier can mark a request Paid** |
| **Removed** | Auto-matching payments by amount when the memo is missing (too easy to get wrong) |
| **Removed (v1)** | API keys for developers. Randi v1 is used through the web app |

## 3. System overview

```
   Merchant (logged in)                 Customer (no account)
          │                                      │
          ▼                                      ▼
 ┌─────────────────────────── randi-web (Next.js, Vercel) ───────────────────────────┐
 │   Dashboard: requests, wallets, pricing,     Payment page: /pay/{requestId}         │
 │   payments, settings                         amounts, wallet, reference, status     │
 └──────────────┬───────────────────────────────────────────┬────────────────────────┘
                │ HTTPS JSON + live updates (SSE)            │
 ┌──────────────▼──────────────────── server ────────────────▼────────────────────────┐
 │                                                                                     │
 │   randi-api (Express)  ◀──── Postgres LISTEN/NOTIFY ────  randi-worker              │
 │   • auth, requests, pricing,                              • watches Stellar          │
 │     wallets, public page data                             • verifies payments        │
 │   • pushes live status                                    • marks Paid / rejects     │
 │          │                                                • expires requests         │
 │          └──────────────▶  PostgreSQL 16  ◀───────────────┘                         │
 │                          (single source of truth)                │                  │
 └──────────────────────────────────────────────────────────────────┼──────────────────┘
                                                                    │ read only
                                                    Stellar Testnet RPC (live events)
                                                    Horizon (backfill + wallet checks)
                                                                    ▲
 Customer's wallet (Freighter, or any Stellar wallet / SEP-7 link) ─┘ signs and sends USDC
```

### Components

| Part | Runs as | Responsible for | Never does |
| --- | --- | --- | --- |
| **randi-web** | Next.js app on Vercel | Merchant dashboard and the public customer payment page | Decide whether something is paid |
| **randi-api** | Node process (pm2) | Accounts, wallets, pricing, creating and listing requests, public page data, live status streams | Change a request to Paid |
| **randi-worker** | Node process (pm2), exactly one | Reading Stellar, verifying each payment, applying the result, expiring requests, health checks | Accept anything a user *says* about a payment |
| **PostgreSQL** | Shared server DB | All data, plus the notification channel between worker and API | — |
| **Stellar Testnet** | External | RPC `getEvents` for live payments; Horizon for history backfill and wallet/trustline checks | — |

**Golden rule:** the worker is the only part of Randi that can mark a request Paid, and only because of a transaction it read from Stellar itself. A customer pasting a hash, clicking "I've paid", or a merchant clicking a button can never do it.

## 4. End-to-end flow

From the ledger closing to "Paid" on the customer's screen takes about 5–10 seconds.

1. **Merchant sets up once.** Signs up, adds their Stellar Testnet wallet, proves they own it (signs a message in Freighter), and optionally sets a fixed rate (e.g. *R18.50 = 1 USDC*).
2. **Merchant creates a request.** Enters the ZAR amount, then either types the USDC amount (manual) or lets Randi calculate it from the fixed rate. Adds a description and expiry. Randi stores a copy of the wallet address, the asset (USDC + Circle Testnet issuer), both amounts and the rate used. It then generates:
   - **Request ID**: 12 random characters, used in the link (`/pay/aZ81kQp0LmX3`)
   - **Payment reference**: the memo the customer must include, `RD` + 8 characters (e.g. `RD7K2M9QXA`)
3. **Merchant shares the link** by copy, WhatsApp, email or QR.
4. **Customer opens the page.** They see the ZAR amount, the exact USDC to send, the network (Stellar Testnet), the asset, the merchant's address, the reference, step-by-step instructions, a QR code and a live status.
5. **Customer pays**, either with *Pay with wallet* (Freighter, xBull or Albedo, one click) or from any Stellar wallet by entering the address, amount and memo. The ledger closes about 5 s later.
6. **Worker detects it.** Every 2 s it reads new payment events from Stellar RPC and keeps those sent to any merchant wallet Randi watches.
7. **Worker verifies it** in one database transaction:
   - records the event once (a duplicate event stops here)
   - finds the request by its reference
   - checks recipient address, asset and issuer, amount, and that the ledger time is before expiry
   - applies the result: **Paid**, **Part-paid**, **Overpaid**, or a rejection (wrong asset, wrong recipient, late, duplicate…)
   - saves the transaction hash on the request
8. **Everyone sees it live.** The worker notifies the API, which pushes the new status to the customer's page and the merchant's dashboard.
9. **Expiry.** A sweeper closes open requests as Expired, but only once both the clock *and* the last processed Stellar ledger are past the expiry time. A slow feed can never expire a request that was paid in time.

## 5. The money model: three facts per request

Every request carries three things, and the UI always keeps them visually separate.

| Fact | Example | Used for | Stored as |
| --- | --- | --- | --- |
| **Requested amount (ZAR)** | R500.00 | What the merchant is charging, in rand. **Display only** | Integer cents |
| **Amount to pay (USDC)** | 27.03 USDC | What the customer sends. **This is what gets verified** | Integer stroops (1 USDC = 10,000,000) |
| **How the USDC amount was set** | "Fixed rate set by merchant: R18.50 = 1 USDC" or "Entered by merchant" | Transparency for the customer and for audit | Pricing mode + a copy of the rate |

How the USDC amount is determined (this answers David's documentation requirement):

- **Manual mode:** the merchant types both the ZAR and the USDC amount. Randi stores them as entered.
- **Fixed-rate mode:** the merchant sets one rate in Settings ("how many rand is 1 USDC"). On a new request they type the ZAR amount, and Randi divides it by the rate and **rounds up to the next 0.01 USDC**. Rounding up means the merchant never receives less than the rand amount at their own rate, and the customer types a short number.
- **No live exchange rate.** Randi never calls an FX or price API. The rate is the merchant's own number and is labelled that way everywhere: *"Rate set by merchant — not a live exchange rate."*
- **Rate frozen per request.** Changing the rate in Settings affects only new requests. Open requests keep the rate they were created with.
- **Verification ignores ZAR.** A payment is judged only by the USDC that arrived. ZAR is never converted back or checked.

All money is held as whole integers (cents and stroops), never floating-point numbers, so there are no rounding errors.

## 6. Request statuses

| Randi status | Meaning | David's word | Final? |
| --- | --- | --- | --- |
| `PENDING` | Open, nothing received yet | Pending | No |
| `PARTIALLY_PAID` | Open, some USDC received, less than asked | Pending (part-paid) | No |
| `PAID` | Exactly the USDC amount received before expiry, verified on-chain | **Paid** | Yes |
| `OVERPAID` | More than asked received before expiry. Treated as paid; the excess is flagged for the merchant to refund | Paid | Yes |
| `EXPIRED` | Expiry passed (by ledger time) without full payment | **Expired** | Yes |
| `CANCELLED` | Merchant cancelled before any payment | — | Yes |
| `FAILED` | Can no longer be paid because of a network condition (a Testnet reset wipes the chain) | **Failed** | Yes |

Each payment Randi sees also gets **one outcome**: *Applied*, or a reason it was not applied (*Wrong asset*, *Counterfeit USDC*, *Wrong recipient*, *Late*, *Already paid*, *After cancel*, *No reference*, *Unknown reference*). Rejected payments never change a request's status. They are shown in the request's timeline and in the merchant's Payments page, so nothing is silently ignored.

## 7. What protects each step

| Risk | Protection |
| --- | --- |
| The same Stellar event seen twice (restart, reconciliation, two data sources) | Each event's unique ID is its database key; a second insert does nothing |
| Two payments for one request processed at the same moment | The request row is locked while a payment is applied |
| Status jumping somewhere invalid (e.g. Expired → Paid) | One function changes status, checking an allowed-transitions table |
| Worker crashes halfway | Recording the payment, applying it and saving the read position happen in one transaction: all or nothing |
| Payment made just before expiry but read just after | Expiry is judged by the ledger's close time, not the time Randi read it |
| Merchant changes wallet or rate while a request is open | The request keeps its own copy of wallet, asset, amounts and rate |
| Customer claims they paid / pastes a hash | Ignored for status. Only events read from Stellar count |
| Fake "USDC" from another issuer | The issuer is checked, not only the code `USDC` |
| Paying to the wrong address | Only the request's own wallet counts. Wrong wallet → rejected (or never seen, so the request stays unpaid) |
| Someone points requests at a wallet they don't own | Wallet ownership proven by a signed message before requests can be created |
| A fake look-alike payment page | Merchant name, verified badge and full address shown; page can't be embedded in another site |

## 8. Key decisions

These are final for v1 unless David asks otherwise.

| Decision | Why | Trade-off accepted |
| --- | --- | --- |
| Payment reference = Stellar **text memo** `RD` + 8 characters | Free, standard, every wallet supports it; no extra accounts needed per request | Customers may forget it → *Unmatched* list where the merchant links it to a request (still verified) |
| Reference unique across Randi, forever | One reference points to exactly one request; lets us detect "right reference, wrong wallet" | None worth noting |
| The same reference as a number (memo ID) and as a muxed `M…` address | Some wallets can't send text memos | Slightly more to show on the page (tucked under "Other ways to pay") |
| **USDC only**, Circle's Testnet issuer | Matches the brief; one asset means no asset confusion for customers | — |
| ZAR is display-only; USDC is verified | No FX in scope; avoids pretending to convert | Customer sees two numbers; the UI makes clear which one to send |
| Fixed rate rounds the USDC **up** to 0.01 | Merchant never short; amount easy to type | Customer may pay up to 0.0099 USDC more than the exact quotient |
| Partial payments add up until expiry | Real customers split payments or short-pay | Requests can end Expired with money received → refund flag |
| Overpayment = paid, excess flagged | The merchant got at least what they asked | Merchant refunds the excess from their own wallet (§12) |
| Ledger close time decides expiry | Lag or a wrong server clock can't wrongly expire a paid request | Expiry may show a few seconds late while the worker catches up |
| Stellar RPC `getEvents` for live data, Horizon for backfill | One event shape covers normal payments, path payments and smart-wallet transfers | Two data sources to reconcile (duplicates removed by event ID and tx details) |
| Postgres LISTEN/NOTIFY, no Redis | One less service on a small server | Exactly one worker process |
| One Next.js app for dashboard and payment page | Shared design, one deploy | The payment page must stay light (no dashboard code on it) |
| Non-custodial | Randi never holds a secret key or moves funds | Refunds are done by the merchant from their own wallet, then marked in Randi |
| Testnet only, enforced | Brief requirement; safety | The server refuses to start with any other network |

## 9. What Randi never does

- Hold, ask for, store or log a Stellar **secret key**. A pasted `S…` key is refused.
- Move money, refund money, or convert currencies.
- Call a live **FX or price feed**.
- Mark a request Paid because of a **customer's claim** or a **merchant's click**.
- Count the **same transaction** twice.
- Run on **mainnet**.

## 10. Deployment

| Piece | Where |
| --- | --- |
| randi-web | Vercel (free tier), `randi.<domain>` |
| randi-api + randi-worker | Two pm2 processes on our existing server, `api.randi.<domain>` behind Caddy (HTTPS) |
| PostgreSQL 16 | On the same server, separate `randi` database and user, localhost only |
| Monitoring | `/health` (DB, last ledger processed, lag), uptime check every 5 min, Telegram alerts on lag or Testnet reset |
| Backups | Nightly encrypted `pg_dump` kept off-server for 7 days |

The web app and API share a registrable domain so the login cookie works. Local development ports are **API 4300** and **Postgres 5438**, so Randi can run next to PayLink (4100/5434) and PayBridge (4200/5436).

## 11. David's brief → where it's handled

| Brief requirement | Handled by | Doc |
| --- | --- | --- |
| Create request with ZAR amount | Create-request API + form | Backend §6, Frontend §5.4 |
| Merchant's Stellar receiving address | Wallets (add, check trustline, prove ownership) | Backend §10 |
| Asset = USDC on Testnet | Fixed asset; wrong asset/issuer rejected | Backend §8 |
| Unique request ID + payment reference | `publicId` + `RD…` memo, both unique | Backend §5 |
| Expiry per request | `expiresAt`, 5 min – 30 days, ledger-time sweeper | Backend §9 |
| Statuses Pending / Paid / Expired / Failed | Status machine | Backend §7 |
| View and manage past requests | Requests list, detail, cancel | Frontend §5.3–5.5 |
| Duplicate events can't change records | Event-ID key + row lock + transitions table | Backend §8 |
| Correct merchant and recipient | Tenant isolation + wallet snapshot + ownership proof | Backend §10, §13 |
| ZAR vs USDC clearly distinguished; how USDC is set documented | Money model and pricing modes | This doc §5, Backend §4 |
| Monitor incoming payments to merchant address | Worker ingestion | Backend §8 |
| Identify request by reference + tx details | Matcher | Backend §8 |
| Verify recipient, asset, amount, reference | Matcher decision table | Backend §8 |
| Request active and not expired | Ledger-time check in matcher | Backend §8 |
| Paid only after verification; tx hash recorded | Worker only; `paidTxHash` | Backend §8 |
| Reject wrong amount / asset / recipient | Outcomes + statuses | Backend §8 |
| Pending, failed, delayed transactions | Page shows "sent, confirming"; failed txs never recorded; reconciliation + backfill | Backend §8.4, Frontend §6 |
| Not paid just because a hash is submitted | No such input changes status | This doc §3 |
| Customer page: ZAR, USDC, network, asset, address, reference, instructions, status, tx hash | `GET /public/pay/{requestId}` (built); `/pay/{requestId}` page (to build) | Backend §11, Frontend §6 |
| Access by link without merchant account | Public, unguessable request ID | Backend §11 |
| Clear "Testnet, no real value" | Permanent banner on every page | Frontend §2, §6 |
| Demo: ≥3 requests, ≥5 real Testnet transactions, all edge cases | `pnpm scenario` → `docs/Evidence.md` | Build-plan §4 |

## 12. Decisions on the open questions

Settled 30 Oct 2026 (the brief leaves these to us). Each is what the code and the Testnet evidence already do.

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| 1 | Does an **overpayment** count as paid? | **Yes.** It becomes `OVERPAID`, which counts as paid (verified, tx hash recorded), and the excess is flagged as a refund the merchant owes. | The merchant received at least what they asked for, on-chain and verified. Rejecting it would leave the customer's money in the merchant's wallet while the request still says unpaid, which is worse for both sides. The brief's rule ("incorrect amount is rejected or remains unpaid") is about paying *too little*; that stays unpaid. |
| 2 | Do **partial payments** add up? | **Yes, until expiry.** Each part is verified on its own; the request is `PARTIALLY_PAID` (not paid) until the USDC received equals the amount asked, to the stroop. If it expires first, it closes `EXPIRED` with a refund owed. | Customers split payments or come up a little short. Nothing is ever marked paid early: the request only becomes Paid on the payment that completes it, and that transaction's hash is the one recorded. |
| 3 | Should Randi suggest a **default fixed rate**? | **No.** The rate is empty until the merchant sets it, and fixed-rate pricing can't be used until then (`RATE_NOT_SET`). | Any number Randi suggested would look like a live exchange rate, which the brief rules out. The rate must always be the merchant's own number. |
| 4 | **Hosting** | Same setup as PayLink: API and worker as two pm2 processes on our existing server behind Caddy at `api.randi.<domain>`; Postgres on the same server (localhost only); the web app on Vercel at `randi.<domain>`. Domain to be confirmed when we deploy. | Proven setup with monitoring, backups and rollback already in place. Both apps share a registrable domain so the login cookie works. |
| 5 | **Codebase** | Built from PayLink's backend (30 Oct 2026). | Reuses a detection and verification engine that already runs on Testnet. While doing this we found and fixed an RPC change (`inSuccessfulContractCall` no longer sent) that made the engine miss every payment. |
