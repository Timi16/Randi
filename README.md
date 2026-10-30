# Randi

Payment requests in **rand**, paid in **USDC** on **Stellar Testnet** (no real money). A merchant
creates a request for, say, R500.00; Randi works out the USDC to pay (typed by the merchant, or from
the merchant's own fixed rate), gives it a request ID, a payment reference and a shareable link; the
customer pays from any Stellar wallet; the worker detects the payment on-chain, verifies it and marks
the request **Paid** with the transaction hash. Wrong amounts, wrong assets, wrong recipients,
duplicates and late payments are recognised and shown, never silently counted.

Randi never converts currencies (the ZAR amount is display only), never holds a secret key and
never moves funds.

The spec lives in [docs/](docs/). `apps/api` is the backend (API + worker). The web app is planned in
[docs/Frontend.md](docs/Frontend.md) and not built yet.

## Run it locally

Needs Node 22+, pnpm and Docker (or your own Postgres 16).

```sh
pnpm install
cp .env.example .env            # then set SESSION_SECRET: openssl rand -hex 32
pnpm db:up                      # Postgres 16 on localhost:5438
pnpm --filter @randi/api db:deploy
pnpm dev                        # API on :4300  (reference at /docs)
pnpm dev:worker                 # ingestion, reconciliation, watchdog, expiry sweeper
pnpm seed                       # optional demo data: demo@randi.test / demo-password-123
```

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test   # tests run against a real Postgres (Testcontainers)
```

## Testnet demo and evidence

The scenario signs up a merchant, sets a fixed rate of R18.50 = 1 USDC, creates ZAR requests and
pays them with real Testnet transactions, covering every item on the brief's checklist. It writes
the results, every request and every transaction hash (with stellar.expert links) to
`docs/Evidence.md`.

```sh
pnpm scenario -- --print-issuer   # prints USDC_ISSUER=G… for the scenario's own testnet USDC
# put that in .env, set EMAIL_VERIFICATION=off, restart the API and worker, then:
pnpm scenario                     # about 10 minutes (one case waits for a real 5-minute expiry)
pnpm scenario -- --skip-timing    # quicker, without the expiry cases
```

## API at a glance

| | |
| --- | --- |
| `POST /v1/payment-requests` | `{ walletId, zarAmount, pricingMode?, usdcAmount?, expiresInMinutes?, description?, customerRef? }` |
| `GET/PUT /v1/pricing` · `POST /v1/pricing/quote` | Default pricing mode and the merchant's fixed rate; preview a request's USDC amount |
| `GET /v1/payment-requests` | Filter by `status`, `needsAttention=true`, wallet, date, search |
| `POST /v1/payments/{eventId}/link` | Link a payment that arrived without a reference (still verified) |
| `GET /public/pay/{requestId}` | What the customer page shows: ZAR, USDC, network, asset, wallet, reference, status, tx hash |

Full reference at `http://localhost:4300/docs`.
