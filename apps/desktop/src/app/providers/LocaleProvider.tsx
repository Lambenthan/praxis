import { useEffect, type ReactNode } from "react";
import { syncLocaleWithSystem, useLocaleStore } from "@/lib/i18n";

const TITLE: Record<string, string> = {
  en: "Fishes",
  zh: "Fishes",
};

/** Applies the current locale to the document root (lang attribute, title). */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useLocaleStore((s) => s.locale);
  // The webview lies about the system language (see syncLocaleWithSystem) —
  // ask the OS once on startup; a stored explicit choice is never overridden.
  useEffect(() => {
    void syncLocaleWithSystem();
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = TITLE[locale];
  }, [locale]);
  return <>{children}</>;
}
