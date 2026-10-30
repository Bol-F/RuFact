"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_PREFERENCES, LEGACY_TEXT_SIZE_KEY, PREFERENCES_STORAGE_KEY, parsePreferences, serializePreferences, type Preferences } from "@/lib/preferences";
import { useLanguage } from "./LanguageProvider";

interface PreferencesContextValue {
  preferences: Preferences;
  ready: boolean;
  persistent: boolean;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  resetPreferences: () => void;
}
const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { locale } = useLanguage();
  const [preferences, updatePreferences] = useState<Preferences>({ ...DEFAULT_PREFERENCES });
  const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const current = useRef(preferences);

  useEffect(() => {
    try {
      const saved = parsePreferences(localStorage.getItem(PREFERENCES_STORAGE_KEY), localStorage.getItem(LEGACY_TEXT_SIZE_KEY));
      current.current = saved;
      startTransition(() => { updatePreferences(saved); setReady(true); });
    } catch { startTransition(() => { setPersistent(false); setReady(true); }); }
    const sync = (event: StorageEvent) => {
      if (event.key !== PREFERENCES_STORAGE_KEY && event.key !== null) return;
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { return; }
      const next = parsePreferences(event.newValue);
      current.current = next;
      updatePreferences(next);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = preferences.design === "auto" ? locale : preferences.design;
    html.dataset.font = preferences.font;
    html.dataset.textSize = preferences.textSize;
  }, [preferences.design, preferences.font, preferences.textSize, locale]);

  const commit = useCallback((next: Preferences) => {
    const encoded = serializePreferences(next);
    const clean = parsePreferences(encoded);
    current.current = clean;
    updatePreferences(clean);
    try {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, encoded);
      // Keep old installations' saved size compatible without an extra control.
      localStorage.setItem(LEGACY_TEXT_SIZE_KEY, clean.textSize);
      setPersistent(true);
    } catch { setPersistent(false); }
  }, []);
  const setPreference = useCallback(<K extends keyof Preferences,>(key: K, value: Preferences[K]) => {
    commit({ ...current.current, [key]: value });
  }, [commit]);
  const resetPreferences = useCallback(() => commit({ ...DEFAULT_PREFERENCES }), [commit]);
  const value = useMemo(() => ({ preferences, ready, persistent, setPreference, resetPreferences }), [preferences, ready, persistent, setPreference, resetPreferences]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("PreferencesProvider is required");
  return context;
}
