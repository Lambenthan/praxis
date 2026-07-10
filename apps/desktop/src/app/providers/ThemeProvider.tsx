import { useEffect, type ReactNode } from "react";
import { useUiStore } from "@/lib/store";

/** Applies the current theme to the document root. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return <>{children}</>;
}
