/** Public configuration only. Payment records and Telegram identifiers stay server-side. */
export const STARS_AMOUNTS = [5, 10, 25] as const;
export const STARS_MIN_AMOUNT = 1;
// Application safety cap, not a claim about Telegram's platform maximum.
export const STARS_MAX_AMOUNT = 10_000;
/** Runtime validation is required at every untrusted payment boundary. */
export type StarsAmount = number;

export interface SupportAvailability {
  starsEnabled: boolean;
  // Wallet requires a separate eligibility, legal and provider integration review.
  walletEnabled: false;
  contactUrl: string | null;
}

export function isStarsAmount(value: unknown): value is StarsAmount {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= STARS_MIN_AMOUNT && value <= STARS_MAX_AMOUNT;
}
