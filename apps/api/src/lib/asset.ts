import { env } from "../config/env";

export interface AssetRef {
  code: string;
  issuer: string;
}

/** The only asset a Randi request can ask for: USDC from the issuer Randi trusts (Circle's testnet issuer). */
export function usdcAsset(): AssetRef {
  return { code: "USDC", issuer: env.USDC_ISSUER };
}
