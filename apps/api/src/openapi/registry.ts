import { OpenApiGeneratorV3, OpenAPIRegistry, type RouteConfig } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import * as s from "@randi/shared";

type Auth = "public" | "session";

interface RouteSpec {
  method: RouteConfig["method"];
  path: string;
  summary: string;
  tag: string;
  auth: Auth;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  headers?: z.ZodObject;
  /** status -> schema (null = no body) */
  success: Record<number, z.ZodType | null>;
  errors?: number[];
  description?: string;
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: "Validation or business-rule failure",
  401: "Not signed in",
  403: "CSRF check failed",
  404: "Missing, or belongs to another merchant",
  409: "Conflict with the current state",
  429: "Rate limited (see Retry-After)",
  503: "Dependency unavailable",
};

// Named components. zod 4 keeps names in its global registry (`.meta({ id })`), which the
// generator reads as the $ref; each id may be registered once, so this runs at module load.
const ErrorResponse = s.ErrorResponseSchema.meta({ id: "Error" });
const schemas = {
  PaymentRequest: s.RequestSchema.meta({ id: "PaymentRequest" }),
  Pricing: s.PricingSettingsSchema.meta({ id: "PricingSettings" }),
  ChainPayment: s.PaymentSchema.meta({ id: "ChainPayment" }),
  RequestEvent: s.RequestEventSchema.meta({ id: "RequestEvent" }),
  Checkout: s.CheckoutSchema.meta({ id: "Checkout" }),
  Health: s.HealthSchema.meta({ id: "Health" }),
};

/**
 * The API reference. Randi v1 is used through its own web app: every /v1 and /auth route
 * works with the dashboard's session cookie (there are no API keys); /public and /health
 * need nothing.
 */
export function buildOpenApiDocument(serverUrl?: string) {
  const registry = new OpenAPIRegistry();
  registry.registerComponent("securitySchemes", "session", {
    type: "apiKey",
    in: "cookie",
    name: "rd_session",
    description: "Set by POST /auth/login. State-changing calls must also send an Origin equal to the web app's origin.",
  });


  const add = (spec: RouteSpec) => {
    const responses: RouteConfig["responses"] = {};
    for (const [status, schema] of Object.entries(spec.success)) {
      responses[status] = schema
        ? { description: "Success", content: { "application/json": { schema } } }
        : { description: "Success, no content" };
    }
    const errors = new Set([...(spec.errors ?? []), 429, ...(spec.auth === "public" ? [] : [401])]);
    for (const status of [...errors].sort()) {
      responses[String(status)] = {
        description: ERROR_DESCRIPTIONS[status] ?? "Error",
        content: { "application/json": { schema: ErrorResponse } },
      };
    }
    registry.registerPath({
      method: spec.method,
      path: spec.path,
      summary: spec.summary,
      description: spec.description,
      tags: [spec.tag],
      security: spec.auth === "public" ? [] : [{ session: [] }],
      request: {
        ...(spec.params ? { params: spec.params } : {}),
        ...(spec.query ? { query: spec.query } : {}),
        ...(spec.headers ? { headers: spec.headers } : {}),
        ...(spec.body ? { body: { content: { "application/json": { schema: spec.body } } } } : {}),
      },
      responses,
    });
  };

  const sse = z.string().meta({ description: "text/event-stream" });

  // Auth
  add({ method: "post", path: "/auth/signup", summary: "Create a merchant account", tag: "Auth", auth: "public", body: s.SignupBody, success: { 201: s.MerchantResponse }, errors: [400, 403, 409] });
  add({ method: "post", path: "/auth/login", summary: "Log in", tag: "Auth", auth: "public", body: s.LoginBody, success: { 200: s.MerchantResponse }, errors: [400, 401, 403] });
  add({ method: "post", path: "/auth/logout", summary: "Log out", tag: "Auth", auth: "session", success: { 204: null }, errors: [403] });
  add({ method: "get", path: "/auth/me", summary: "Current merchant (with pricing settings)", tag: "Auth", auth: "session", success: { 200: s.MerchantResponse } });
  add({ method: "post", path: "/auth/email/verify", summary: "Confirm the email with the 6-digit code", tag: "Auth", auth: "session", body: s.VerifyEmailBody, success: { 200: s.MerchantResponse }, errors: [400, 403] });
  add({ method: "post", path: "/auth/password/forgot", summary: "Email a one-hour password reset link (same answer whether or not the account exists)", tag: "Auth", auth: "public", body: s.ForgotPasswordBody, success: { 204: null }, errors: [400, 403, 503] });
  add({ method: "post", path: "/auth/password/reset", summary: "Set a new password from an emailed link; signs out everywhere", tag: "Auth", auth: "public", body: s.ResetPasswordBody, success: { 204: null }, errors: [400, 403] });
  add({ method: "get", path: "/auth/sessions", summary: "Where the merchant is signed in", tag: "Auth", auth: "session", success: { 200: s.SessionListResponse } });
  add({ method: "delete", path: "/auth/sessions/{id}", summary: "Sign one session out", tag: "Auth", auth: "session", params: s.SessionIdParamsSchema, success: { 204: null }, errors: [403, 404] });
  add({ method: "post", path: "/auth/sessions/logout-others", summary: "Sign out every other session", tag: "Auth", auth: "session", success: { 204: null }, errors: [403] });
  add({ method: "post", path: "/auth/settings", summary: "Update merchant settings (business name, support contact, request defaults)", tag: "Auth", auth: "session", body: s.UpdateSettingsBody, success: { 200: s.MerchantResponse }, errors: [400, 403] });
  add({ method: "post", path: "/auth/password", summary: "Change password (other sessions are signed out)", tag: "Auth", auth: "session", body: s.ChangePasswordBody, success: { 204: null }, errors: [400, 403] });

  // Pricing
  add({ method: "get", path: "/v1/pricing", summary: "Get pricing settings", tag: "Pricing", auth: "session", success: { 200: s.PricingResponse } });
  add({ method: "put", path: "/v1/pricing", summary: "Update pricing settings", description: "Default mode (MANUAL or FIXED_RATE) and the merchant's own fixed rate in ZAR per 1 USDC. Not a live exchange rate. A new rate applies to new requests only.", tag: "Pricing", auth: "session", body: s.UpdatePricingBody, success: { 200: s.PricingResponse }, errors: [400, 403] });
  add({ method: "post", path: "/v1/pricing/quote", summary: "Preview a request's USDC amount", description: "The same calculation as creating a request; nothing is saved. FIXED_RATE rounds the USDC amount up to the next 0.01.", tag: "Pricing", auth: "session", body: s.QuoteBody, success: { 200: s.QuoteResponse }, errors: [400, 403] });

  // Wallets
  add({ method: "get", path: "/v1/wallets", summary: "List wallets", tag: "Wallets", auth: "session", success: { 200: s.WalletListResponse } });
  add({ method: "post", path: "/v1/wallets", summary: "Add a wallet (unverified)", tag: "Wallets", auth: "session", body: s.AddWalletBody, success: { 201: s.WalletResponse }, errors: [400, 403, 409] });
  add({ method: "post", path: "/v1/wallets/{id}/refresh", summary: "Re-check the account and USDC trustline on Horizon", tag: "Wallets", auth: "session", params: s.IdParamsSchema, success: { 200: s.WalletResponse }, errors: [403, 404, 503] });
  add({ method: "post", path: "/v1/wallets/{id}/challenge", summary: "Issue an ownership challenge to sign (SEP-53)", tag: "Wallets", auth: "session", params: s.IdParamsSchema, success: { 200: s.ChallengeResponse }, errors: [403, 404] });
  add({ method: "post", path: "/v1/wallets/{id}/verify", summary: "Verify the signed challenge", tag: "Wallets", auth: "session", params: s.IdParamsSchema, body: s.VerifyWalletBody, success: { 200: s.WalletResponse }, errors: [400, 403, 404] });
  add({ method: "delete", path: "/v1/wallets/{id}", summary: "Remove a wallet (soft; watched until its open requests close)", tag: "Wallets", auth: "session", params: s.IdParamsSchema, success: { 204: null }, errors: [403, 404] });

  // Payment requests
  add({
    method: "post", path: "/v1/payment-requests", summary: "Create a ZAR payment request", tag: "Payment requests", auth: "session",
    body: s.CreateRequestBody,
    headers: z.object({ "Idempotency-Key": s.IdempotencyKeySchema.optional() }),
    success: { 201: s.RequestCreatedResponse, 200: s.RequestCreatedResponse },
    errors: [400, 403, 404, 409, 503],
    description: "The ZAR amount is what the merchant charges (display only); the USDC amount is what the customer sends and what is verified. MANUAL: send usdcAmount. FIXED_RATE: Randi divides by the merchant's own rate and rounds up to 0.01 USDC. Returns 201 for a new request; with an Idempotency-Key that was already used, the original request with 200, or 409 IDEMPOTENCY_MISMATCH if the body differs.",
  });
  add({ method: "get", path: "/v1/payment-requests", summary: "List payment requests", tag: "Payment requests", auth: "session", query: s.ListRequestsQuery, success: { 200: s.RequestListResponse }, errors: [400] });
  add({ method: "get", path: "/v1/payment-requests/stats", summary: "Count requests by status", description: "Counts per status under the same filters as the list.", tag: "Payment requests", auth: "session", query: s.RequestStatsQuery, success: { 200: s.RequestStatsResponse }, errors: [400] });
  add({ method: "get", path: "/v1/payment-requests/{id}", summary: "Get a payment request", description: "The request with every payment linked to it (whatever the outcome) and its audit trail.", tag: "Payment requests", auth: "session", params: s.IdParamsSchema, success: { 200: s.RequestDetailResponse }, errors: [404] });
  add({ method: "post", path: "/v1/payment-requests/{id}/cancel", summary: "Cancel a payment request", description: "Only a PENDING request can be cancelled.", tag: "Payment requests", auth: "session", params: s.IdParamsSchema, success: { 200: s.RequestResponse }, errors: [403, 404, 409] });
  add({ method: "post", path: "/v1/payment-requests/{id}/refunded", summary: "Mark a request refunded", description: "Records that you sent back what the request itself owed: the excess over the amount asked, or money counted before it closed. Randi never moves funds; this only records it.", tag: "Payment requests", auth: "session", params: s.IdParamsSchema, body: s.MarkRefundedBody, success: { 200: s.RequestResponse }, errors: [400, 403, 404, 409] });
  add({ method: "get", path: "/v1/summary", summary: "Get an overview", description: "USDC collected, ZAR requested, requests created and settled, open requests, and what needs attention, since `from`.", tag: "Payment requests", auth: "session", query: s.SummaryQuery, success: { 200: s.SummaryResponse }, errors: [400] });

  // Payments
  add({ method: "get", path: "/v1/payments", summary: "List payments", description: "Every payment that reached your wallets, whatever the outcome. Use `unmatched=true` for the ones that could not be tied to a request.", tag: "Payments", auth: "session", query: s.ListPaymentsQuery, success: { 200: s.PaymentListResponse }, errors: [400] });
  add({ method: "post", path: "/v1/payments/{eventId}/link", summary: "Link a payment to a request", description: "Ties an unmatched payment (no or unknown reference) to one of your requests on the same wallet and asset. The ledger time must still be before the request's expiry, and the USDC amount is compared as usual.", tag: "Payments", auth: "session", params: s.EventIdParamsSchema, body: s.LinkPaymentBody, success: { 200: s.LinkResponse }, errors: [400, 403, 404, 409] });
  add({ method: "post", path: "/v1/payments/{eventId}/refunded", summary: "Mark a payment refunded", description: "Records that you sent a payment back to its payer. Not for payments that were applied to a request. Randi never moves funds.", tag: "Payments", auth: "session", params: s.EventIdParamsSchema, body: s.MarkRefundedBody, success: { 200: s.PaymentResponse }, errors: [400, 403, 404, 409] });

  // Live + public
  add({ method: "get", path: "/v1/stream", summary: "Merchant live stream (SSE): request.updated, payment.detected, wallet.updated", tag: "Live", auth: "session", success: { 200: sse } });
  add({ method: "get", path: "/public/pay/{publicId}", summary: "Get payment page data", description: "Everything the customer payment page shows: ZAR and USDC amounts, how the USDC amount was set, network, asset, wallet, reference, status and the verified tx hash. No sign-in needed.", tag: "Public payment page", auth: "public", params: s.PublicIdParamsSchema, success: { 200: schemas.Checkout }, errors: [404] });
  add({ method: "get", path: "/public/pay/{publicId}/events", summary: "Stream payment status", description: "Server-Sent Events: a `status` event on connect and on every change.", tag: "Public payment page", auth: "public", params: s.PublicIdParamsSchema, success: { 200: sse }, errors: [404] });
  add({ method: "get", path: "/health", summary: "Health", description: "Database status, last processed ledger, lag in seconds and open request count.", tag: "System", auth: "public", success: { 200: schemas.Health }, errors: [503] });

  // Every named model is listed in components, even ones no route returns on its own.
  const models = [ErrorResponse, ...Object.values(schemas)].map((schema) => ({ type: "schema" as const, schema }));
  return new OpenApiGeneratorV3([...registry.definitions, ...models]).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Randi API",
      version: "1.0.0",
      description: [
        "ZAR-priced payment requests paid in USDC on **Stellar Testnet**. No real money moves, and Randi never converts currencies: the ZAR amount is display only, the USDC amount is what gets verified on-chain.",
        "",
        "## Conventions",
        "- **Amounts** are decimal strings: ZAR with up to 2 decimals, USDC with up to 7; responses also carry exact cents and stroops.",
        "- **Idempotency**: the dashboard sends an `Idempotency-Key` when creating a request so a double-click never creates two.",
        "- **Errors** share one shape: `{ error: { code, message, details, requestId } }`.",
        "- **Pagination**: lists take `limit` and `cursor` and return `{ data, nextCursor }`.",
        "- **Paid** is set only by the worker after it reads the transaction from Stellar. No endpoint marks a request paid.",
      ].join("\n"),
    },
    tags: [
      { name: "Payment requests", description: "Create a ZAR request, follow it, cancel it." },
      { name: "Pricing", description: "How the USDC amount is set: entered by hand, or from the merchant's own fixed rate." },
      { name: "Payments", description: "Everything that reached your wallets, including payments that could not be matched." },
      { name: "Wallets", description: "Receiving wallets, their USDC trustline and proof of ownership." },
      { name: "Public payment page", description: "What the shareable customer page reads. No sign-in needed." },
      { name: "Auth" },
      { name: "Live" },
      { name: "System" },
    ],
    servers: serverUrl ? [{ url: serverUrl }] : [],
  });
}
