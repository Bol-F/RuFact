/** Public configuration only. Payment records and Telegram identifiers stay server-side. */
export const STARS_AMOUNTS = [50, 100, 250] as const;
export type StarsAmount = (typeof STARS_AMOUNTS)[number];

export interface SupportAvailability {
  starsEnabled: boolean;
  // Wallet requires a separate eligibility, legal and provider integration review.
  walletEnabled: false;
  contactUrl: string | null;
}

export function isStarsAmount(value: unknown): value is StarsAmount {
  return typeof value === "number" && STARS_AMOUNTS.some(amount => amount === value);
}
