# Randi

South African merchants create payment requests priced in ZAR; the customer pays the matching
USDC on Stellar Testnet; the worker detects and verifies the payment and marks the request Paid.
Backend design comes from PayLink (`~/Documents/Paylink`); PayBridge is unrelated (payroll).

**Read everything in /docs before starting any task.** `docs/Architecture.md`, `docs/Backend.md`,
`docs/Frontend.md` and `docs/Build-plan.md` are the spec.

## Working rules

1. Follow the docs. If something is unclear or seems wrong, ask before building. If we agree on a change, update the matching doc in the same commit.
2. One phase at a time, in order. A phase is done only when its gate check passes.
3. TypeScript strict everywhere; no `any`, no unexplained `@ts-ignore`.
4. Money is never a float: bigint cents (ZAR), stroops (USDC) and rate units in code, BigInt columns in Postgres, decimal strings in JSON. `parseFloat` and `Number()` on amounts are banned (ESLint enforces it).
5. ZAR is display only. Verification compares USDC stroops only. No FX or price API, ever: the fixed rate is the merchant's own number.
6. A payment request's status changes in exactly one function (`transitionRequest` in `apps/api/src/modules/transitions.ts`). Only the worker can make a request PAID/OVERPAID, and only from a transaction it read from Stellar. There is no accept or mark-paid endpoint.
7. Expiry is judged by ledger close time, never by server clock alone.
8. A payment reference (memo, `RD` + 8 Crockford chars) is never reused anywhere in Randi.
9. Every edge-case ID in the docs (Z, P, T, M, C, S) gets at least one test whose name starts with that ID; scenario cases (D, P, T) run on Testnet.
10. Never log secrets: passwords, session tokens, cookies, full Authorization headers. Never store or log a Stellar secret key, even if a user pastes one.
11. Testnet only: refuse to boot unless the network passphrase is the testnet one.
12. Before saying a task is done, run `pnpm lint`, `pnpm typecheck` and `pnpm test`, and report the results.
13. Small commits with conventional messages (`feat:`, `fix:`, `test:`, `docs:`).

## Layout

- `apps/api`: one codebase, two processes: `src/server.ts` (API) and `src/worker.ts` (ingestion, reconciliation, watchdog, expiry sweeper).
- `apps/api/src/lib/pricing.ts`: ZAR → USDC (manual or the merchant's fixed rate, rounded up to 0.01 USDC).
- `packages/shared`: Zod schemas, amount/ZAR/rate helpers and types shared with the (future) web app.
- `apps/api/scripts`: `scenario.ts` (Testnet end-to-end, writes `docs/Evidence.md`), `evidence.ts`, `seed.ts`.
- `apps/web`: not built yet; see `docs/Frontend.md`.
- Layering: routes → service → repo. Repos that touch merchant data take `merchantId` first.

## Commands

`pnpm db:up` (Postgres on 5438) · `pnpm --filter @randi/api db:deploy` · `pnpm dev` (API on 4300) ·
`pnpm dev:worker` · `pnpm lint` · `pnpm typecheck` · `pnpm test` (needs Docker for Testcontainers) ·
`pnpm scenario` · `pnpm seed` · `pnpm --filter @randi/api openapi`
