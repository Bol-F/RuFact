import type { AppLocale } from "./i18n";

// Content-addressed derivatives; keep originals and photo credits in regional-artwork.ts.
export const HERO_ARTWORK = {
  ru: { src: "/artwork/russian-d5fd68878744-full.webp", small: "/artwork/russian-142bec56a6ef-960.webp", width: 1774, height: 887 },
  uz: { src: "/artwork/uzbek-93eecc199257-full.webp", small: "/artwork/uzbek-06a3199305d2-960.webp", width: 1200, height: 800 },
  en: { src: "/artwork/english-c539968b77ba-full.webp", small: "/artwork/english-339a218c0887-960.webp", width: 1200, height: 800 },
} as const satisfies Record<AppLocale, { src: string; small: string; width: number; height: number }>;

export const HERO_ARTWORK_SIZES = "(max-width: 1023px) 92vw, 640px";
export const HIDDEN_ARTWORK_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
export function artworkSrcSet(locale: AppLocale) {
  const artwork = HERO_ARTWORK[locale];
  return `${artwork.small} 960w, ${artwork.src} ${artwork.width}w`;
}
