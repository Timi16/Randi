# Randi — Backend

30 Oct 2026 · @Timmy · Read [Architecture.md](Architecture.md) first.

The backend is one TypeScript codebase that runs as **two processes**:

- **randi-api**: the HTTP API used by the web app (merchant dashboard + public payment page).
- **randi-worker**: reads Stellar Testnet, verifies payments, applies results, expires requests.

They share one PostgreSQL database and talk through Postgres `LISTEN/NOTIFY`.

---

## 1. Scope

**In v1:** merchant accounts, receiving wallets with ownership proof, pricing (manual or fixed rate), payment requests with ZAR + USDC amounts, a public payment page API, automatic on-chain detection and verification, live status, unmatched payments, refund flags, demo scenario.

**Not in v1:** live FX or price feeds, ZAR settlement or bank payouts, mainnet, XLM payments, API keys for developers, refunds sent by Randi, invoices/PDFs, customer emails, admin panel.

## 2. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js 22 LTS | Same as PayLink; long-term support |
| HTTP | Express 5 | Small, known, async error handling built in |
| Language | TypeScript 5, strict mode | Catches money and null mistakes early |
| Database | PostgreSQL 16 via Prisma 6, plus `pg` for LISTEN/NOTIFY | Strong transactions, row locks, unique constraints |
| Validation + API reference | Zod schemas → OpenAPI, Scalar page at `/docs` | One source of truth for input rules and docs |
| Stellar | `@stellar/stellar-sdk` (RPC + Horizon clients, address and signature checks) | Official SDK |
| Security | helmet, cors, rate limiting, argon2 password hashing | Standard hardening |
| Logging | pino with secret redaction | Fast, structured |
| Tests | Vitest, supertest, Testcontainers (real Postgres), property tests for money maths | Tests run against a real database, not mocks |
| Process manager | pm2 | Restarts on crash and on reboot |

## 3. Processes and folder layout

### What each process does

| Process | Jobs | How many |
| --- | --- | --- |
| randi-api | REST API, cookie sessions, live status streams (SSE), public payment-page data | 1 (more are safe) |
| randi-worker | Ingestion loop (every 2 s), reconciliation (every 2 min), expiry sweeper (every 15 s), watchdog, Testnet-reset detection | **Exactly 1** |

### Planned folder layout

```
apps/api/
  prisma/                 schema + migrations
  src/
    server.ts             starts the API process
    worker.ts             starts the worker process
    app.ts                builds the Express app (also used by tests)
    config/               environment validation (refuses non-Testnet)
    db/                   database client, notify/listen helpers
    lib/                  money (cents/stroops), pricing, reference (memo), ids, errors, logger
    middleware/           request id, auth, origin check, rate limits, validation, idempotency, errors
    modules/              each has routes → service → repo
      auth/               sign up, log in, sessions, settings
      wallets/            add, check on Horizon, ownership challenge + verify, remove
      pricing/            pricing settings + quote preview
      requests/           create, list, detail, cancel
      transitions         the ONE place a request status changes
      payments/           payments list, unmatched, link to request, mark refunded
      public/             payment-page data + live stream
      stream/             merchant live stream
      health/
    engine/
      sources/            Stellar RPC events (live), Horizon (backfill)
      decode              raw event → normalised payment
      watchedWallets      which addresses to watch
      matcher             verification rules (section 8)
      ingestion           main loop + saved position (cursor)
      reconciliation, watchdog, networkReset, expirySweeper
  scripts/                scenario (Testnet demo), seed (demo data), evidence (writes docs/Evidence.md)
packages/shared/          Zod schemas + types shared with the web app
```

**Layering rule:** routes → service → repo. Every repo function touching merchant data takes `merchantId` and filters by it, so one merchant can never read another's data.

---

## 4. Money and pricing rules

### 4.1 Units

| Amount | Unit in code and database | Unit in JSON | Rules |
| --- | --- | --- | --- |
| ZAR | Integer **cents** (`zarAmountCents`) | Decimal string `"500.00"` | 0.01 – 1,000,000.00; max 2 decimals |
| USDC | Integer **stroops** (1 USDC = 10,000,000) | Decimal string `"27.0300000"` plus stroops alongside | > 0; max 7 decimals; minimum 0.01 USDC |
| Rate | Integer, **4 decimal places** (`R18.5000` per 1 USDC = 185000) | Decimal string `"18.5000"` | 1.0000 – 1,000.0000 ZAR per USDC |

Money is **never** a floating-point number anywhere. `parseFloat` and `Number()` on amounts are banned by a lint rule. Amounts travel as strings and become integers at the edge.

### 4.2 Pricing modes

Each merchant has pricing settings:

| Setting | Values | Default |
| --- | --- | --- |
| `defaultPricingMode` | `MANUAL` or `FIXED_RATE` | `MANUAL` |
| `fixedRate` | ZAR per 1 USDC, or empty | Empty |
| `rateUpdatedAt` | Time the rate last changed | — |

Each request picks a mode when it is created (starting from the default):

- **MANUAL:** the merchant sends `zarAmount` **and** `usdcAmount`. Both are stored exactly as entered. `rateSnapshot` is empty. The API also stores the *implied rate* (ZAR ÷ USDC) purely for display; it is never used in calculations.
- **FIXED_RATE:** the merchant sends only `zarAmount`. The API calculates `usdcAmount = zarAmount ÷ fixedRate`, **rounded up to the next 0.01 USDC**, and stores that rate in `rateSnapshot`. If no rate is set → `400 RATE_NOT_SET`. If the result is under 0.01 USDC → `400 AMOUNT_TOO_SMALL`. If the client also sends a `usdcAmount` in this mode → `400 VALIDATION_FAILED` (one source of truth).

Worked examples (fixed rate):

| ZAR | Rate | Exact | USDC to pay |
| --- | --- | --- | --- |
| R500.00 | 18.5000 | 27.027027… | **27.03** |
| R100.00 | 18.0000 | 5.555555… | **5.56** |
| R1,850.00 | 18.5000 | 100.000000 | **100.00** |

The calculation uses integer maths only: ZAR cents × 10⁹ ÷ rate units gives exact stroops, then rounds up to a multiple of 100,000 stroops (0.01 USDC).

**One function, two callers.** The quote preview endpoint (used by the form as the merchant types) and the create endpoint call the same pricing function, so the preview always equals what gets saved.

### 4.3 What pricing never does

- Never fetches a rate from anywhere. The rate is the merchant's own number.
- Never changes an existing request's amounts. Rate changes apply to new requests only.
- Never takes part in verification. The matcher compares USDC stroops only.

---

## 5. Request ID and payment reference

| Identifier | Format | Example | Purpose |
| --- | --- | --- | --- |
| Internal `id` | cuid | `clx9…` | Database key; never shown publicly |
| **Request ID** (`publicId`) | 12 random base62 characters (secure RNG) | `aZ81kQp0LmX3` | In the link `/pay/aZ81kQp0LmX3`. Unguessable and not sequential |
| **Payment reference** (`reference`) | `RD` + 8 Crockford base32 characters | `RD7K2M9QXA` | Sent as the Stellar **text memo**. Unique across Randi forever |
| Reference as number (`memoId`) | The 8 characters as a 40-bit number | `264582209450` | For wallets that can only send numeric memos |
| Muxed address (`muxedAddress`) | Merchant wallet + `memoId` | `MABC…` | For smart (contract) wallets that can't send memos |

Reference rules:

- Generated with a secure random generator. A collision is caught by a unique constraint and retried.
- **Never reused**, even after its request expires or is cancelled.
- Crockford alphabet (no I, L, O, U) so it's hard to mistype. When matching, Randi forgives typing mistakes: trims spaces and dashes, uppercases, and reads O as 0 and I/L as 1.
- 10 characters, well inside Stellar's 28-byte text memo limit.

---

## 6. Creating a request

**Input** (dashboard form → `POST /v1/payment-requests`):

| Field | Required | Rule |
| --- | --- | --- |
| `walletId` | Yes (defaults to merchant's default wallet) | Must be the merchant's own, **verified**, and able to receive USDC |
| `zarAmount` | Yes | See 4.1 |
| `pricingMode` | No (merchant default) | `MANUAL` or `FIXED_RATE` |
| `usdcAmount` | Only in MANUAL | See 4.1 |
| `expiresInMinutes` | No (merchant default, else 30) | 5 – 43,200 (30 days) |
| `description` | No | ≤ 200 chars, shown as plain text |
| `customerRef` | No | ≤ 64 chars, the merchant's own order number |
| `Idempotency-Key` header | Sent by the form | Stops a double-click creating two requests |

**Steps:**

1. Validate input (strict: unknown fields rejected).
2. Check the wallet: owned by this merchant, verified, account exists, has a USDC trustline from the right issuer, and enough trustline room for the amount. Re-check on Horizon if the cached check is older than 5 minutes.
3. Work out the USDC amount (section 4.2).
4. Copy into the request: wallet address, asset code `USDC`, asset issuer, ZAR cents, USDC stroops, pricing mode, rate.
5. Generate the request ID and reference.
6. Save as `PENDING` with `expiresAt = now + expiresInMinutes`; write the first audit event.
7. Return the request and its `paymentUrl`.

**Duplicate-request protection:** same merchant + same `Idempotency-Key` returns the original request (200, not a second one). Same key with a different body → `409 IDEMPOTENCY_MISMATCH`. Enforced by a database unique constraint, so it holds even with simultaneous retries.

---

## 7. Status machine

A request's status changes in **exactly one function** (`transitionRequest`). It:

1. runs inside a database transaction holding a lock on the request row,
2. checks the move is in the table below,
3. updates only if the status is still what it expected (otherwise `409 INVALID_TRANSITION`),
4. writes an append-only audit event (from, to, reason, actor, linked payment).

A lint rule forbids setting `status` anywhere else.

| From | Allowed to | Triggered by |
| --- | --- | --- |
| `PENDING` | `PARTIALLY_PAID`, `PAID`, `OVERPAID` | Worker: verified payment |
| `PENDING` | `EXPIRED` | Worker: expiry sweeper or a late payment |
| `PENDING` | `CANCELLED` | Merchant |
| `PENDING` | `FAILED` | Worker: Testnet reset |
| `PARTIALLY_PAID` | `PAID`, `OVERPAID` | Worker: verified payment completes it |
| `PARTIALLY_PAID` | `EXPIRED` | Worker |
| `PARTIALLY_PAID` | `FAILED` | Worker: Testnet reset |
| `PAID`, `OVERPAID`, `EXPIRED`, `CANCELLED`, `FAILED` | — (final) | — |

Notes:

- `PAID` / `OVERPAID` can only be reached by the **worker** after verifying a real transaction. There is no merchant "mark as paid" and no "accept" button.
- A second partial payment (still short) keeps `PARTIALLY_PAID`. It updates the received amount and writes an audit event, but isn't a status change.
- Cancel is allowed only from `PENDING`. Once money has arrived the merchant waits for payment or expiry, so the record always matches the chain.
- A request closed with money received (expired part-paid, overpaid, failed) gets `refundDue` per asset and `refundOwed = true` when any amount ≥ 0.01 USDC.

---

## 8. Detecting and verifying payments (worker)

### 8.1 Ingestion

- **Source:** Stellar RPC `getEvents` (Testnet), polled every 2 s from a saved position (cursor), 200 events per page. Since Protocol 23, classic payments, path payments and smart-wallet transfers all appear as the same `transfer` / `mint` events (CAP-67), so one reader catches every kind of payment.
- **Filter:** keep `transfer` and `mint` events from **any** asset whose destination is a watched wallet. Wrong-asset and fake-issuer payments must be seen so they can be reported. An event is trusted only if it comes from the official Stellar Asset Contract for the asset it names, so a custom contract can't fake a payment.
- **Decode** each event into a *normalised payment*: event ID, tx hash (and inner hash for fee-bumps), ledger, ledger close time, from, to, muxed ID, memo (type + value), asset code + issuer, amount in stroops. If the memo isn't in the event, read it from the transaction (cached).
- **Watched wallets:** every active merchant wallet, plus removed wallets that still have open requests. Refreshed on a `wallets_changed` notification and every 30 s.
- **One transaction per page:** run the matcher on each payment, save the cursor, commit, then notify the API (`request_updated`, `payment_detected`). If anything fails, the whole page rolls back and is retried. The cursor never moves past unprocessed events.
- **Backoff** on RPC errors: 1 s up to 30 s.
- **Backfill:** if the cursor is older than RPC's history window (after a long outage), older ledgers are read from Horizon. A payment already recorded from the other source is skipped.

### 8.2 Verification rules (the matcher)

For each normalised payment, inside the page's transaction, in this order:

| Step | Check | If it fails → outcome | Request status effect |
| --- | --- | --- | --- |
| 1 | Insert the payment by **event ID**. Already exists? | Stop. Nothing changes (duplicate event) | None |
| 2 | Has a memo? | `NO_MEMO` → Unmatched list | None |
| 3 | Memo type is text or ID (or muxed ID)? | `MEMO_TYPE_MISMATCH` → Unmatched | None |
| 4 | Normalised memo matches a request? (lock that row) | `UNKNOWN_MEMO` → Unmatched | None |
| 5 | Paid to **that request's** wallet address? | `WRONG_WALLET` (rejected, wrong recipient) | None |
| 6 | Asset code is `USDC`? | `WRONG_ASSET` (rejected, unsupported asset) | None |
| 7 | Issuer is Circle's Testnet issuer? | `WRONG_ISSUER` (rejected, counterfeit) | None |
| 8 | Request is open (`PENDING`/`PARTIALLY_PAID`)? | `DUPLICATE` if already Paid/Overpaid · `AFTER_CANCEL` if Cancelled · `LATE` if Expired · `AFTER_CLOSE` if Failed | None |
| 9 | Ledger close time ≤ `expiresAt`? | `LATE`; request moved to `EXPIRED` | → `EXPIRED` |
| 10 | Add amount to `receivedStroops` and compare to `usdcAmountStroops` | `COUNTED` | → `PARTIALLY_PAID` (less) · `PAID` (equal) · `OVERPAID` (more) |

When the outcome is `PAID` or `OVERPAID`: set `paidAt` (ledger close time) and `paidTxHash` (the transaction that completed it). Every payment that matched a reference, **including rejected ones**, is linked to that request so it shows in the request's timeline.

Amounts are compared **to the stroop**. 27.0299999 for a 27.03 request is `PARTIALLY_PAID`, never rounded to Paid.

How outcomes appear to people:

| Outcome | Merchant sees | Customer sees (on that request's page) |
| --- | --- | --- |
| `COUNTED` | Applied | Paid / "X USDC still due" |
| `WRONG_ASSET`, `WRONG_ISSUER` | Rejected: wrong asset / counterfeit USDC. Refund owed | "We received a payment in the wrong asset. It was not applied." |
| `WRONG_WALLET` | Rejected: paid to a different wallet | (shown on the request it referenced) |
| `DUPLICATE`, `LATE`, `AFTER_CANCEL`, `AFTER_CLOSE` | Not applied. Refund owed | Status stays as it is |
| `NO_MEMO`, `UNKNOWN_MEMO`, `MEMO_TYPE_MISMATCH` | Unmatched: link to a request, or refund | — |

### 8.3 Unmatched payments and linking

A payment that reached a merchant wallet but couldn't be tied to a request (no or unknown reference) appears in **Unmatched**. The merchant can **link** it to one of their requests. Linking:

- is allowed only for unmatched outcomes, and only to a request on the **same wallet and asset**,
- re-runs steps 6–10 above, so the **ledger time must still be before expiry** and the amount is compared as normal,
- records `linkedManually = true` and who linked it.

This doesn't break "Paid only after verification": the transaction is still real, on-chain, to the right wallet, in the right asset, and on time. The merchant only supplies the missing reference.

### 8.4 Pending, failed and delayed transactions

| Situation | What happens |
| --- | --- |
| **Pending** (customer submitted, ledger not closed yet) | Stellar has no public pending pool; a transaction is either in a ledger (~5 s) or rejected. The payment page shows "Sent — waiting for Stellar to confirm" from the Freighter submission. The request stays `PENDING` until the worker sees the ledger |
| **Failed transaction** (bad sequence, not enough balance, no trustline…) | A failed transaction emits no transfer event, so nothing is recorded or counted. The payment page shows the wallet's error to the customer |
| **Submit timed out** | The page checks the transaction by hash and never resubmits blindly, so a payment can't be sent twice |
| **Delayed detection** (RPC slow or down, worker restarted) | The worker resumes from its cursor; reconciliation re-reads the last 60 ledgers every 2 min; backfill covers longer gaps. Ledger-time expiry means a payment made in time still counts when read late |
| **Fee-bump transaction** | Both outer and inner hashes stored |

### 8.5 Reliability jobs

- **Reconciliation** (every 2 min): re-reads the last 60 ledgers. Anything already recorded is a no-op thanks to the event-ID key.
- **Watchdog:** if processing falls more than 12 ledgers behind for 2 min, it sends an alert. If the worker's heartbeat goes stale, it exits so pm2 restarts it.
- **Testnet reset detection:** Testnet is wiped from time to time. If the network tip is far behind our cursor on 3 polls in a row (and the tip is fresh), Randi: moves open requests to `FAILED` (reason `network_reset`), resets the cursor, prefixes old event IDs so they can't collide with new ones, and alerts. Payments to those requests afterwards get `AFTER_CLOSE`.

---

## 9. Expiry

- Every 15 s the sweeper takes `cutoff = the earlier of (now, close time of the last fully processed ledger)`.
- Open requests (`PENDING`, `PARTIALLY_PAID`) with `expiresAt < cutoff` move to `EXPIRED`, one transaction each, with a row lock, via `transitionRequest`.
- If ingestion is behind, the cutoff stays behind too, so **nothing expires early** and a payment made in time is never lost.
- A payment whose ledger time is after expiry is `LATE` and never counts.
- The server clock is kept accurate with chrony, but the ledger time is what decides.

---

## 10. Wallets

### 10.1 Adding a wallet

- Must be a valid Stellar public key (`G…`). Muxed `M…` addresses are refused (use the base `G…`). A pasted secret key (`S…`) is **refused and never stored or logged**.
- One active wallet per address across Randi. A wallet another merchant has verified is `409 WALLET_TAKEN`. An unverified claim never blocks the real owner.

### 10.2 Checks on Horizon

- Account exists on Testnet? (404 → `ACCOUNT_NOT_FOUND`)
- Has a USDC trustline from Circle's Testnet issuer? (`NO_TRUSTLINE`)
- Trustline room (limit − balance) ≥ amount still due? (`TRUSTLINE_LIMIT_TOO_LOW`)
- Results cached on the wallet. Re-checked when a request is created (if older than 5 min) and when the payment page loads (cached 30 s). The payment page gets `canReceive` plus a reason, so a customer is never asked to pay a wallet that can't receive.

### 10.3 Proving ownership

1. Dashboard asks for a challenge: Randi stores a message with the merchant, a random nonce and a 10-minute expiry.
2. The merchant signs the message in **Freighter** (SEP-53 message signing).
3. Randi checks the signature against the wallet address, marks the challenge used (single use) and the wallet verified.

Requests can only be created on verified wallets. This is how Randi ensures "the correct merchant and intended recipient".

### 10.4 Removing a wallet

Soft delete. The wallet stays watched until its open requests close, and those requests keep their copy of the address.

---

## 11. Live updates and public page data

- The API keeps one database connection listening for `request_updated` and `payment_detected`, and fans out to connected browsers over **Server-Sent Events**.
- **Public stream** `GET /public/pay/:requestId/events`: sends the current status when it connects, then each change (`status`, `usdcReceived`, `usdcRemaining`, `paidTxHash`, `expiresAt`); a keep-alive every 25 s; closes 5 s after a final status. Max 5 open streams per IP; 60-minute lifetime.
- **Merchant stream** `GET /v1/stream`: `request.updated`, `payment.detected` (including unmatched and rejected), `wallet.updated`. 15-minute lifetime, re-authenticated on reconnect.
- The web app falls back to polling every 5 s if streams are blocked.
- **The public page data exposes only:** request ID, business name, support contact, verified-wallet flag, network name, reference (+ memo ID, muxed address), ZAR amount, USDC amount, USDC received/remaining, pricing (mode, rate snapshot or implied rate), asset code + issuer, wallet address, description, order number (`customerRef`), status, expiry, paid time, paid tx hash + explorer link, `canReceive` (+ reason), payments with this reference that were rejected for their asset (so the page can say so), and a SEP-7 payment link. Nothing else about the merchant: no email, no internal ids.

---

## 12. Data model

Tables and their important fields. Field names are the plan; Prisma types follow the units in section 4.

### Merchant
| Field | Notes |
| --- | --- |
| id, email (unique), passwordHash (argon2id), businessName, emailVerifiedAt | |
| supportContact | Optional, shown on the payment page |
| defaultWalletId, defaultExpiryMinutes | Form defaults |
| defaultPricingMode | `MANUAL` / `FIXED_RATE` |
| fixedRate | Integer, 4 decimals; empty until set |
| rateUpdatedAt, createdAt | |

### Session and account security (kept from PayLink)
- **Session:** id (HMAC-SHA256 of the cookie token), merchantId, expiresAt, lastSeenAt, ip, userAgent, createdAt.
- **TrustedDevice** (browsers exempt from the account-wide login lock), **EmailVerification** (6-digit sign-up code, only when SMTP is set up), **PasswordReset** (one-hour single-use link), **LoginThrottle** and **RateLimit** (counters shared by every API instance).

### Wallet
| Field | Notes |
| --- | --- |
| id, merchantId, address, label | |
| verifiedAt | Set after a valid signed challenge |
| accountExists, trustlines (cached), checkedAt | From Horizon |
| deletedAt | Soft delete |

### WalletChallenge
id, merchantId, address, message, expiresAt (10 min), usedAt.

### PaymentRequest
| Field | Notes |
| --- | --- |
| id, **publicId** (unique), **memo** (unique) | Section 5. The `memo` column is the payment reference; the API calls it `reference` |
| merchantId, walletId | |
| walletAddress, assetCode, assetIssuer | **Copies** taken at creation |
| **zarAmountCents** | Display amount |
| **usdcAmountStroops** | Verified amount |
| receivedStroops | Sum of counted payments |
| **pricingMode**, **rateSnapshot** | How the USDC amount was set. MANUAL's implied rate is computed when shown, never stored |
| status | Section 7; the reason for each change is in RequestEvent |
| description, customerRef | |
| expiresAt, paidAt, **paidTxHash**, cancelledAt, refundedAt, refundTxHash | |
| idempotencyKey, idempotencyHash | Unique per merchant |
| createdAt, updatedAt | |

Indexes: (merchantId, createdAt), (status, expiresAt).

### ChainPayment (every payment Randi sees)
| Field | Notes |
| --- | --- |
| **eventId** (primary key) | The duplicate guard |
| txHash, innerTxHash, ledger, ledgerClosedAt | |
| walletId, fromAddress, toAddress, toMuxedId | |
| memoRaw, memoNormalized, memoType | |
| assetCode, assetIssuer, amountStroops | |
| source | `rpc` / `horizon` |
| requestId | Empty = unmatched |
| **outcome** | Section 8.2 |
| matchedBy | `memo` or `manual` |
| linkedManually, linkedAt | Section 8.3 |
| refundedAt, refundTxHash | Merchant marks a refund done |

### RequestEvent (append-only audit trail)
id, requestId, fromStatus, toStatus, reason (`created`, `payment_counted`, `expired`, `cancelled`, `network_reset`), actor (`system`/`merchant`), paymentEventId, createdAt. Never updated or deleted.

### Cursor
name, ledger, pagingToken, ledgerClosedAt (used by the sweeper), networkPassphrase, lastNetworkResetAt.

---

## 13. Security

**Accounts**
- Passwords: argon2id, at least 10 characters. Same error for wrong email or wrong password.
- Sessions: 32-byte random token in an `httpOnly`, `Secure`, `SameSite=Lax` cookie (`rd_session`); only its hash is stored; 14-day expiry; rotated on login.
- CSRF: cookie-authenticated writes must carry an `Origin` equal to the web app's origin.
- Login rate limit 5/min per IP, plus growing delays after repeated failures.

**Tenant isolation**
- Every merchant-data query filters by `merchantId`. Another merchant's request or wallet returns `404`, proven by tests.

**Public payment page**
- Unguessable 12-character request ID.
- Exposes only the fields in section 11.
- 60 requests/min per IP; max 5 live streams per IP.
- `frame-ancestors 'none'` so the page can't be embedded in a fake site.

**Input / output**
- Strict Zod validation on every body, query and parameter (unknown fields rejected).
- Amount formats enforced by regex before conversion to integers.
- Descriptions rendered as plain text only.

**Stellar**
- Testnet passphrase enforced at boot; any other network → refuse to start.
- Secret keys refused and never logged.
- Events trusted only from the official asset contract; issuer always checked.

**HTTP and ops**
- helmet (HSTS, nosniff, strict referrer), CORS allow-list = web origin, JSON body limit 50 kb.
- Logs redact cookies, authorization headers, passwords.
- `.env` never committed; `.env.example` kept complete and checked in CI.
- Server: firewall (22/80/443 only), SSH keys only, fail2ban, automatic security updates, Postgres on localhost only.

---

## 14. REST API

All responses are JSON. Amounts in and out are **decimal strings** (stroops alongside in responses). "Session" = logged-in merchant (cookie). "Public" = no login.

### Auth (session)
| Method + path | Body | Result |
| --- | --- | --- |
| `POST /auth/signup` | email, password, businessName | 201, merchant + cookie |
| `POST /auth/login` | email, password | 200, merchant + cookie |
| `POST /auth/logout` | — | 204 |
| `GET /auth/me` | — | merchant (incl. pricing settings) |
| `POST /auth/settings` | any of businessName, supportContact, defaultWalletId, defaultExpiryMinutes | merchant |
| `POST /auth/password` | currentPassword, newPassword | 204; other sessions signed out |
| `POST /auth/email/verify` · `POST /auth/email/resend` | code | Confirms the sign-up email (only when SMTP is set up) |
| `POST /auth/password/forgot` · `POST /auth/password/reset` | email / token, newPassword | One-hour, single-use reset link |
| `GET /auth/sessions` · `DELETE /auth/sessions/:id` · `POST /auth/sessions/logout-others` | — | Where the merchant is signed in |

`POST /auth/login` also takes `remember` (default true: 14 days; false: browser-session cookie, one day).

### Pricing (session)
| Method + path | Body | Result |
| --- | --- | --- |
| `GET /v1/pricing` | — | defaultMode, fixedRate, rateUpdatedAt |
| `PUT /v1/pricing` | defaultMode, fixedRate (or empty) | updated settings. `FIXED_RATE` default needs a rate |
| `POST /v1/pricing/quote` | zarAmount, (pricingMode, usdcAmount for manual) | zarAmount, usdcAmount, pricingMode, rate, impliedRate. Same function as create; nothing saved |

### Wallets (session)
| Method + path | Body | Result |
| --- | --- | --- |
| `GET /v1/wallets` | — | list with verified, accountExists, trustline, canReceive |
| `POST /v1/wallets` | address, label? | 201 wallet (unverified) |
| `POST /v1/wallets/:id/refresh` | — | wallet with fresh Horizon data |
| `POST /v1/wallets/:id/challenge` | — | challengeId, message, expiresAt |
| `POST /v1/wallets/:id/verify` | challengeId, signature | wallet with verifiedAt |
| `DELETE /v1/wallets/:id` | — | 204 (soft) |

### Payment requests (session)
| Method + path | Body / query | Result |
| --- | --- | --- |
| `POST /v1/payment-requests` | Section 6; header `Idempotency-Key` | 201 `{ request, paymentUrl }` (200 with the original on a replay) |
| `GET /v1/payment-requests` | status, needsAttention, walletId, from, to, q (reference, request ID or customerRef), cursor, limit | data + nextCursor |
| `GET /v1/payment-requests/stats` | same filters minus status | `{ total, byStatus }` for the filter chips |
| `GET /v1/payment-requests/:id` | — | request + every linked payment (all outcomes) + audit trail |
| `POST /v1/payment-requests/:id/cancel` | — | request; 409 unless `PENDING` |
| `POST /v1/payment-requests/:id/refunded` | txHash? | records that the merchant returned excess/closed money |
| `GET /v1/summary` | from | Overview: USDC collected, ZAR requested, requests created/settled, open and part-paid, unmatched, refunds owed |

Request JSON carries: `id`, `publicId` (the request ID), `status`, `wallet`, `network`, `asset`, `zarAmount`, `usdcAmount`, `usdcReceived`, `usdcRemaining` (plus exact cents/stroops), `pricing { mode, rate, impliedRate }`, `reference`, `memoId`, `muxedAddress`, `description`, `customerRef`, `expiresAt`, `paidAt`, `paidTxHash`, `cancelledAt`, `refundOwed`, `refundDue`, `paymentUrl`.

`needsAttention = true` returns requests the merchant should look at: open but the wallet can't receive, have rejected or uncounted payments, or owe a refund. The dashboard calls these "Needs attention" (the brief's "invalid" requests).

### Payments (session)
| Method + path | Body / query | Result |
| --- | --- | --- |
| `GET /v1/payments` | outcome, unmatched, walletId, from, to, cursor, limit | data + nextCursor; unmatched payments carry `suggestedRequestId` (the one open request they exactly settle, a hint only) |
| `POST /v1/payments/:eventId/link` | requestId | payment + request (section 8.3) |
| `POST /v1/payments/:eventId/refunded` | txHash? | payment |

### Public (no login)
| Method + path | Result |
| --- | --- |
| `GET /public/pay/:requestId` | Payment page data (section 11) |
| `GET /public/pay/:requestId/events` | Live status stream |

### Other
`GET /v1/stream` (merchant live stream) · `GET /health` · `GET /openapi.json` · `GET /docs`.

Lists take `limit` (1–100, default 50) and an opaque `cursor`.

---

## 15. Errors

Shape: `{ "error": { "code", "message", "details", "requestId" } }`.

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_FAILED` | 400 | Input failed validation |
| `SECRET_KEY_REJECTED` | 400 | An `S…` key was submitted |
| `RATE_NOT_SET` | 400 | Fixed-rate request but no rate configured |
| `AMOUNT_TOO_SMALL` | 400 | USDC under 0.01 |
| `UNSUPPORTED_ASSET` | 400 | Anything but USDC requested |
| `WALLET_NOT_VERIFIED` | 400 | Request on an unverified wallet |
| `ACCOUNT_NOT_FOUND` · `NO_TRUSTLINE` · `TRUSTLINE_LIMIT_TOO_LOW` | 400 | Wallet can't receive |
| `INVALID_SIGNATURE` · `CHALLENGE_EXPIRED` | 400 | Ownership proof failed |
| `INVALID_CODE` | 400 | Wrong email confirmation code |
| `UNAUTHENTICATED` · `INVALID_CREDENTIALS` | 401 | Not logged in / wrong login |
| `FORBIDDEN_ORIGIN` · `EMAIL_NOT_VERIFIED` | 403 | CSRF check failed / sign-up email not confirmed |
| `NOT_FOUND` | 404 | Missing, or another merchant's |
| `INVALID_TRANSITION` | 409 | e.g. cancelling a paid request |
| `WALLET_TAKEN` · `EMAIL_TAKEN` | 409 | Already in use |
| `IDEMPOTENCY_MISMATCH` | 409 | Same key, different body |
| `PAYMENT_NOT_LINKABLE` | 409 | Link rules in 8.3 not met |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 50 kb |
| `RATE_LIMITED` | 429 | With `Retry-After` |
| `HORIZON_UNAVAILABLE` · `SERVICE_UNAVAILABLE` | 503 | Upstream or database down |
| `INTERNAL` | 500 | Generic message; details only in logs |

---

## 16. Configuration

Validated at startup; the process stops with a clear message if anything is wrong.

| Variable | Example | Used by | Rule |
| --- | --- | --- | --- |
| `NODE_ENV` | production | both | |
| `PORT` / `HOST` | 4300 / 127.0.0.1 | api | Caddy proxies on the same machine |
| `DATABASE_URL` | postgresql://randi:…@localhost:5432/randi | both | Dev: port 5438 |
| `STELLAR_RPC_URL` | https://soroban-testnet.stellar.org | worker | |
| `HORIZON_URL` | https://horizon-testnet.stellar.org | both | |
| `NETWORK_PASSPHRASE` | Test SDF Network ; September 2015 | both | **Must** be Testnet |
| `USDC_ISSUER` | GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 | both | Circle's Testnet USDC |
| `WEB_ORIGIN` | https://randi.<domain> | api | CORS, CSRF, payment links |
| `SESSION_SECRET` | 64 hex chars | api | ≥ 32 bytes |
| `SMTP_URL` / `MAIL_FROM` | smtps://… | api | Optional: sign-up codes and password reset emails |
| `EMAIL_VERIFICATION` | auto | api | auto (on when SMTP_URL is set) / on / off |
| `ALERT_TELEGRAM_BOT_TOKEN` / `_CHAT_ID` | | worker | Optional |
| `LOG_LEVEL` | info | both | |

---

## 17. Testing plan

Every case has an ID, and each has at least one automated test whose name starts with that ID
(e.g. *"P6: right memo but XLM for a USDC request is WRONG_ASSET"*), so coverage can be checked with
a search. Unit tests cover money, pricing, references, decoding, transitions and refunds. Integration
tests run against a real Postgres (Testcontainers). The **scenario** (`pnpm scenario`) repeats the
cases marked ★ as real Testnet transactions and adds David's checklist (D1–D9, Build-plan §4).

The numbering follows PayLink's suite, which Randi's tests are based on; Z cases are new.

### Z — ZAR and pricing
| ID | Case | Expected |
|---|---|---|
| Z1 | MANUAL: R500.00 + 27.00 USDC | Stored exactly; no rate; implied rate 18.5185 shown |
| Z2 | Fixed rate 18.50, R500.00 | 27.03 USDC (rounded up), rate frozen on the request |
| Z3 | Fixed rate 18.00, R100.00; any amount and rate | 5.56 USDC, never 5.55; never below the exact quotient, never 0.01 above |
| Z4 | Rate changed after a request is created | Open request keeps its rate and amounts (API and payment page) |
| Z5 | ZAR 0, negative, 3 decimals, over R1,000,000.00, not a string | 400 |
| Z6 | Fixed-rate mode (or default) with no rate set | 400 `RATE_NOT_SET` |
| Z7 | USDC under 0.01 | 400 `AMOUNT_TOO_SMALL` (fixed rate rounds up to 0.01 instead) |
| Z8 | Fixed rate with a `usdcAmount`; manual without one | 400 |
| Z9 | Quote preview vs created request | Identical amounts; a quote saves nothing |
| Z10 | Verification uses USDC only | The exact USDC amount pays it, whatever the ZAR |

### P — Payment verification
| ID | Case | Expected |
|---|---|---|
| P1 ★ | Right wallet, USDC, issuer, amount, reference, in time | `COUNTED` → `PAID`, tx hash stored |
| P2 ★ | No memo | `NO_MEMO`, Unmatched; never matched by amount (only suggested); merchant can link it |
| P3 ★ | Unknown reference | `UNKNOWN_MEMO`, Unmatched |
| P4 ★ | Reference typed lowercase / O for 0 / with spaces or dashes | Normalised → `COUNTED` |
| P5 ★ | MEMO_ID / MEMO_HASH | `MEMO_TYPE_MISMATCH`, Unmatched, unless the MEMO_ID equals the request's memo ID |
| P6 ★ | Right reference, **XLM** instead of USDC | `WRONG_ASSET`; request unchanged |
| P7 ★ | Right reference, "USDC" from a **fake issuer** | `WRONG_ISSUER`; request unchanged |
| P8 ★ | Right reference, but the request is on **another merchant's** wallet | `WRONG_WALLET`; request unchanged |
| P9 ★ | Less than asked | `COUNTED` → `PARTIALLY_PAID`, remaining shown; **not Paid** |
| P10 ★ | Partials that add up exactly | Last one → `PAID` |
| P11 ★ | More than asked | `COUNTED` → `OVERPAID`, refund owed for the excess |
| P12 ★ | Payment after Paid | `DUPLICATE`; status and tx hash unchanged |
| P13 ★ | Two payment operations to one request in one transaction | Both counted, summed |
| P14 ★ | Path payment (customer sends XLM, wallet receives USDC) | Counted by USDC received |
| P15 ★ | Contract wallet pays the request's muxed address | Matched by the mux id |
| P16 | Paid to the wallet's M-address with an unrelated mux id | `MEMO_TYPE_MISMATCH`, linkable |
| P17 | Payment from the issuer (mint) | Matched normally |
| P18 ★ | Off by one stroop | `PARTIALLY_PAID` or `OVERPAID`, never rounded |
| P19 ★ | Failed transaction | Nothing recorded |
| P20 ★ | Fee-bump transaction | Both hashes stored |
| P21 | Claimable balance claim | `NO_MEMO`, linkable |

### T — Timing and lifecycle
| ID | Case | Expected |
|---|---|---|
| T1 ★ | Ledger before expiry, read after | `PAID` |
| T2 ★ | Paid after expiry | `LATE`; request `EXPIRED`; never Paid |
| T3 ★ | Partial, then expiry | `EXPIRED`, amount received shown, refund owed |
| T4 ★ | Paid after cancel; cancelling a part-paid or paid request | `AFTER_CANCEL`, stays `CANCELLED`, refund owed / 409 |
| T5 | Worker 3 min behind at expiry | Not expired until the processed ledger passes expiry |
| T6 | Server clock skew | Ledger time decides |
| T7 ★ | Expiry outside 5 min – 30 days | 400 |
| T8 | Any "accept" / "mark paid" call, also with a real tx hash | 404: no such endpoint; status unchanged |

### M — Merchant and wallets
| ID | Case | Expected |
|---|---|---|
| M1 | Invalid address, `M…` address, or `S…` secret | 400; secret never stored/logged |
| M2 | Account doesn't exist | `ACCOUNT_NOT_FOUND` |
| M3 | No USDC trustline | `NO_TRUSTLINE`; payment page `canReceive: false` |
| M4 | Trustline limit too low | `TRUSTLINE_LIMIT_TOO_LOW` |
| M5 | Wallet removed with open requests | Still watched; requests keep their copy |
| M6 | Wallet verified by another merchant; races; squatting | 409 `WALLET_TAKEN`; one owner; an unverified claim never blocks |
| M7 | Same idempotency key twice / different body / concurrent retries | Same request / 409 / exactly one |
| M8 | USDC 0, negative, > 7 decimals, too large, under 0.01 | 400 |
| M9 | Any asset but USDC | 400 `UNSUPPORTED_ASSET` |
| — | Merchant A reads, cancels, links or refunds Merchant B's data | 404 (tenant isolation suite) |

### C — Payment page (API side)
| ID | Case | Expected |
|---|---|---|
| C1 | Unknown request ID | 404 |
| C2 | Public data | Only the allowed fields; tx hash + explorer link once paid; wrong-asset payments reported |
| C5 | Reload after paying | Current status returned |
| C6 | Stream dropped, reconnected, or database listener reconnected | Snapshot on reconnect; final status never missed; events in order |
| C8 | Two payments land together; the same event twice at once | Exact sum, one status change each; recorded once |

### S — System
| ID | Case | Expected |
|---|---|---|
| S1 | Worker killed mid-page; bursts larger than a page | Page rolls back and replays; counts exact |
| S2 | RPC down / lagging | Backoff, alert, full catch-up, nothing expired early |
| S3 | Postgres down | API 503; worker pauses, cursor not advanced |
| S4 | Server reboot; down longer than RPC history | Resumes from cursor; gap backfilled from Horizon without double counting |
| S5 | Testnet reset | Open requests → `FAILED`; later payments `AFTER_CLOSE`; alert; a stale RPC node is not a reset |
