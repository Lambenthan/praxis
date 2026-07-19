import { useEffect, type ReactNode } from "react";
import { useLocaleStore } from "@/lib/i18n";

const TITLE: Record<string, string> = {
  en: "Fishes",
  zh: "Fishes",
};

/** Applies the current locale to the document root (lang attribute, title). */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useLocaleStore((s) => s.locale);
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = TITLE[locale];
  }, [locale]);
  return <>{children}</>;
}
