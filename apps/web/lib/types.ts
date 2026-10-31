// The API's shapes, straight from the shared package, plus the list envelopes.
import type { ChainPayment, PaymentRequest, RequestEvent } from "@randi/shared";

export type {
  ChainPayment,
  ChallengeResponse,
  Checkout,
  CheckoutStatus,
  Merchant,
  PaymentOutcome,
  PaymentRequest,
  PricingMode,
  PricingSettings,
  Quote,
  RequestEvent,
  RequestStats,
  RequestStatus,
  Session,
  Summary,
  Trustline,
  Wallet,
} from "@randi/shared";

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface RequestDetail {
  request: PaymentRequest;
  payments: ChainPayment[];
  events: RequestEvent[];
}

export interface AssetRef {
  code: string;
  issuer: string | null;
}
