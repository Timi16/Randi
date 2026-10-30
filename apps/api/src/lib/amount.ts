// string <-> bigint stroops (USDC), cents (ZAR) and rate units. The implementation lives in
// @randi/shared so the web app formats amounts exactly the same way.
export {
  parseAmount,
  formatStroops,
  STROOPS_PER_UNIT,
  MAX_STROOPS,
  AMOUNT_REGEX,
  parseZar,
  formatZar,
  parseRate,
  formatRate,
  usdcForZar,
  impliedRate,
  MIN_USDC_STROOPS,
} from "@randi/shared";
