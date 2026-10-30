import { isSearchTopic, type SearchTopic } from "./search-topics.ts";

export const PREFERENCES_STORAGE_KEY = "rufact.preferences.v1";
export const LEGACY_TEXT_SIZE_KEY = "rufact.text-size.v1";
export const FONT_STYLES = ["original", "sans", "serif"] as const;
export const TEXT_SIZES = ["normal", "large", "larger"] as const;
export const DESIGNS = ["auto", "ru", "uz", "en"] as const;
export interface Preferences {
  font: (typeof FONT_STYLES)[number];
  textSize: (typeof TEXT_SIZES)[number];
  design: (typeof DESIGNS)[number];
  topic: SearchTopic;
}
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({ font: "original", textSize: "normal", design: "auto", topic: "general" });

export function parsePreferences(raw: string | null, legacySize?: string | null): Preferences {
  const defaults = { ...DEFAULT_PREFERENCES };
  if (TEXT_SIZES.includes(legacySize as Preferences["textSize"])) defaults.textSize = legacySize as Preferences["textSize"];
  if (!raw || raw.length > 2048) return defaults;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
    const data = value as Record<string, unknown>;
    if (data.version !== 1) return defaults;
    return {
      font: FONT_STYLES.includes(data.font as Preferences["font"]) ? data.font as Preferences["font"] : defaults.font,
      textSize: TEXT_SIZES.includes(data.textSize as Preferences["textSize"]) ? data.textSize as Preferences["textSize"] : defaults.textSize,
      design: DESIGNS.includes(data.design as Preferences["design"]) ? data.design as Preferences["design"] : defaults.design,
      topic: isSearchTopic(data.topic) ? data.topic : defaults.topic,
    };
  } catch { return defaults; }
}

export function serializePreferences(preferences: Preferences) {
  // Keep the device store bounded and strip any unknown/injected properties.
  const clean = parsePreferences(JSON.stringify({ ...preferences, version: 1 }));
  return JSON.stringify({ version: 1, ...clean });
}
