"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MESSAGES, type Messages } from "./messages";
import { isLocale, type Locale } from "./types";
import {
  publishDeskLocale,
  subscribeDesk,
} from "@/lib/desk-channel";

const STORAGE_KEY = "pockassist.locale";

type LocaleContextValue = {
  locale: Locale;
  t: Messages;
  setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* ignore */
  }
  if (window.petassist) {
    const lang = window.navigator.language.toLowerCase();
    return lang.startsWith("ja") ? "ja" : "en";
  }
  return "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    publishDeskLocale(next);
  }, []);

  useEffect(() => {
    return subscribeDesk((event) => {
      if (event.type !== "locale") return;
      if (!isLocale(event.locale)) return;
      setLocaleState(event.locale);
      try {
        window.localStorage.setItem(STORAGE_KEY, event.locale);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      t: MESSAGES[locale],
      setLocale,
    }),
    [locale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useI18n must be used inside LocaleProvider");
  }
  return ctx;
}
