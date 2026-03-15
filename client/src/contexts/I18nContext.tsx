/**
 * I18n Context [Part 9.1 — Africa First]
 * Provides language switching across the app.
 * Default: English. Persisted in localStorage.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { type Locale, type TranslationKeys, getTranslations } from "@/lib/i18n";

interface I18nContextValue {
  locale: Locale;
  t: TranslationKeys;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const LOCALE_KEY = "ww-locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(LOCALE_KEY);
    return (saved as Locale) ?? "en";
  });

  const t = getTranslations(locale);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_KEY, newLocale);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
