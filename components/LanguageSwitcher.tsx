"use client";

import { Languages } from "lucide-react";

import { languageNames, SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, copy } = useLanguage();

  return (
    <label
      className={`language-switcher focus-within:ring-2 focus-within:ring-[#789bb8] inline-flex items-center rounded-[11px] border border-[#d7d8d3] bg-[#fbfaf6]/90 text-[#173552] ${
        compact ? "min-h-11 w-full px-2.5" : "min-h-11 px-3"
      }`}
    >
      <Languages size={15} strokeWidth={1.9} aria-hidden="true" />
      <span className="sr-only">{copy.navigation.language}</span>
      <select
        value={locale}
        aria-label={copy.navigation.language}
        onChange={(event) => setLocale(event.target.value as AppLocale)}
        className="min-h-11 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent px-2 text-[0.875rem] font-bold outline-none"
      >
        {SUPPORTED_LOCALES.map((item) => (
          <option key={item} value={item}>
            {languageNames[item]}
          </option>
        ))}
      </select>
    </label>
  );
}
