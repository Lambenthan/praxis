import { useCallback } from "react";
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

/**
 * Correct the default language from the OS. WKWebView's navigator.language
 * follows the APP's declared localizations, not the system — a zh_CN mac
 * reports "en-US" (user hit this: a fresh install came up all-English). When
 * the user has made NO explicit choice, ask the OS through Tauri and fix the
 * in-memory default only — nothing is persisted, so a stored choice always
 * wins and the default keeps tracking the system.
 */
export async function syncLocaleWithSystem(): Promise<void> {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored === "en" || stored === "zh") return; // explicit choice wins
  } catch {
    return; // tests / storage unavailable — leave the default alone
  }
  const { isTauri } = await import("@/lib/tauri");
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const zhSystem = await invoke<boolean>("system_locale_is_chinese").catch(() => false);
  const want: Locale = zhSystem ? "zh" : "en";
  if (useLocaleStore.getState().locale !== want) useLocaleStore.setState({ locale: want });
}

export function translate(source: string, locale: Locale): string {
  return locale === "zh" ? (zh[source] ?? source) : source;
}

/** Reactive translator for components — re-renders on locale change. */
export function useT(): (source: string) => string {
  const locale = useLocaleStore((s) => s.locale);
  // Memoized: components put `t` in effect deps — a fresh closure per render
  // re-ran those effects on EVERY render (the wiki card reload loop).
  return useCallback((source) => translate(source, locale), [locale]);
}

/** Non-reactive translator for rare non-component call sites. */
export function t(source: string): string {
  return translate(source, useLocaleStore.getState().locale);
}
