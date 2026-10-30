// Money is never a float: decimal strings at the edges, bigint stroops inside.
export const STROOPS_PER_UNIT = 10_000_000n;
export const AMOUNT_DECIMALS = 7;
/** Largest amount Stellar (int64) and Postgres BIGINT can hold. */
export const MAX_STROOPS = 9_223_372_036_854_775_807n;
export const AMOUNT_REGEX = /^\d{1,12}(\.\d{1,7})?$/;

/** Parses "50", "50.5", "0.0000001" into stroops. Returns null for anything else. */
export function parseAmount(input: string): bigint | null {
  if (typeof input !== "string" || !AMOUNT_REGEX.test(input)) return null;
  const [whole = "0", frac = ""] = input.split(".");
  const stroops = BigInt(whole) * STROOPS_PER_UNIT + BigInt(frac.padEnd(AMOUNT_DECIMALS, "0"));
  return stroops > MAX_STROOPS ? null : stroops;
}

/** Formats stroops as a 7-decimal string, e.g. 500000000n -> "50.0000000". */
export function formatStroops(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_UNIT;
  const frac = (abs % STROOPS_PER_UNIT).toString().padStart(AMOUNT_DECIMALS, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`;
}

// ZAR: integer cents. Display only; Randi never converts or verifies rand.
export const ZAR_REGEX = /^\d{1,7}(\.\d{1,2})?$/;
export const MAX_ZAR_CENTS = 100_000_000n; // R1,000,000.00

/** Parses "500", "500.5", "500.50" into cents. Returns null for anything else. */
export function parseZar(input: string): bigint | null {
  if (typeof input !== "string" || !ZAR_REGEX.test(input)) return null;
  const [whole = "0", frac = ""] = input.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
}

/** Formats cents as "500.00". */
export function formatZar(cents: bigint): string {
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${whole.toString()}.${frac}`;
}

// Fixed rate: ZAR per 1 USDC with 4 decimals, e.g. R18.50 = 185000. The merchant's own number.
export const RATE_DECIMALS = 4;
export const RATE_SCALE = 10_000n;
export const RATE_REGEX = /^\d{1,4}(\.\d{1,4})?$/;
export const MIN_RATE_UNITS = 10_000n; // R1.0000
export const MAX_RATE_UNITS = 10_000_000n; // R1,000.0000

/** Parses "18.5" into rate units (185000). Returns null for anything else. */
export function parseRate(input: string): bigint | null {
  if (typeof input !== "string" || !RATE_REGEX.test(input)) return null;
  const [whole = "0", frac = ""] = input.split(".");
  return BigInt(whole) * RATE_SCALE + BigInt(frac.padEnd(RATE_DECIMALS, "0"));
}

/** Formats rate units as "18.5000". */
export function formatRate(units: bigint): string {
  const whole = units / RATE_SCALE;
  const frac = (units % RATE_SCALE).toString().padStart(RATE_DECIMALS, "0");
  return `${whole.toString()}.${frac}`;
}

/** 0.01 USDC: the smallest amount a request may ask for, and the step fixed-rate amounts round up to. */
export const MIN_USDC_STROOPS = 100_000n;

/**
 * FIXED_RATE pricing: USDC = ZAR / rate, rounded UP to the next 0.01 USDC so the merchant is
 * never short at their own rate and the customer types a short number. Integer maths only:
 * cents * 10^9 / rate units is exact stroops (cents/100 * 10^7 stroops * 10^4 / units).
 */
export function usdcForZar(zarCents: bigint, rateUnits: bigint): bigint {
  if (rateUnits <= 0n) throw new RangeError("rate must be positive");
  const numerator = zarCents * 1_000_000_000n;
  const exact = numerator / rateUnits + (numerator % rateUnits === 0n ? 0n : 1n);
  const steps = exact / MIN_USDC_STROOPS + (exact % MIN_USDC_STROOPS === 0n ? 0n : 1n);
  return steps * MIN_USDC_STROOPS;
}

/** MANUAL pricing: the rate the two typed amounts imply (ZAR per USDC, 4 decimals, half up). For display only. */
export function impliedRate(zarCents: bigint, usdcStroops: bigint): bigint | null {
  if (usdcStroops <= 0n) return null;
  const numerator = zarCents * 1_000_000_000n;
  return (numerator * 2n + usdcStroops) / (usdcStroops * 2n);
}
