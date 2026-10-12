import { HERO_ARTWORK } from "./hero-artwork";

/** Decorative photo-based collages, never fact-checking evidence. */
export const REGIONAL_ARTWORK = {
  uz: {
    src: HERO_ARTWORK.uz.src,
    author: "Bernard Gagnon",
    source: "https://commons.wikimedia.org/wiki/File:Registan_01.jpg",
    license: "CC0 1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    credit: "Surat",
    adaptation: "AI yordamida kollajga moslashtirilgan",
  },
  en: {
    src: HERO_ARTWORK.en.src,
    author: "Jdforrester / Cakelot1",
    source: "https://commons.wikimedia.org/wiki/File:Palace_of_Westminster_-_wide_panorama_shot_from_Albert_Embankment,_March_2024_(cropped).jpg",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    credit: "Photo",
    adaptation: "AI-assisted collage adaptation",
  },
} as const;
