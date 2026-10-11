"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_LOCALE,
  getTranslations,
  isAppLocale,
  localeTags,
  type AppLocale,
} from "@/lib/i18n";

const STORAGE_KEY = "rufact.locale.v1";

interface LanguageContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  copy: ReturnType<typeof getTranslations>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<AppLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isAppLocale(saved) && saved !== DEFAULT_LOCALE) {
        startTransition(() => updateLocale(saved));
      }
    } catch { /* Language switching still works when browser storage is disabled. */ }
  }, []);

  useEffect(() => {
    document.documentElement.lang = localeTags[locale];
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    updateLocale(nextLocale);
    try { window.localStorage.setItem(STORAGE_KEY, nextLocale); } catch { /* Session-only preference. */ }
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, copy: getTranslations(locale) }),
    [locale, setLocale],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
