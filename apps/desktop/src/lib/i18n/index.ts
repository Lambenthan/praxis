import { create } from "zustand";
import { zh } from "./zh";

/**
 * Lightweight gettext-style i18n. The English source string IS the key:
 * `t("Save")` looks it up in the zh dictionary and falls back to the
 * English original when no entry exists — a missing translation can never
 * break the UI. Locale defaults to the system language and persists in
 * localStorage (absent in jsdom, so tests always run in English).
 */
export type Locale = "en" | "zh";

const LOCALE_KEY = "locale";

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch {
    // localStorage unavailable (tests) — fall through to system detection
  }
  if (typeof navigator !== "undefined" && /^zh/i.test(navigator.language ?? "")) return "zh";
  return "en";
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: initialLocale(),
  setLocale: (locale) => {
    try {
      localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      // persistence is best-effort
    }
    set({ locale });
  },
}));

export function translate(source: string, locale: Locale): string {
  return locale === "zh" ? (zh[source] ?? source) : source;
}

/** Reactive translator for components — re-renders on locale change. */
export function useT(): (source: string) => string {
  const locale = useLocaleStore((s) => s.locale);
  return (source) => translate(source, locale);
}

/** Non-reactive translator for rare non-component call sites. */
export function t(source: string): string {
  return translate(source, useLocaleStore.getState().locale);
}
