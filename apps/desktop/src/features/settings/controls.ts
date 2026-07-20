import { cn } from "@/lib/cn";

/* One look for every control on the Settings surface — shared by the page and
 * the feature-module sections so inputs and buttons stay identical everywhere. */

export const inputCls = (extra = "") =>
  cn(
    "h-9 rounded-input border border-border bg-surface px-3 text-[15px] text-text outline-none",
    "placeholder:text-muted focus:border-accent/60",
    extra,
  );

export const btnGhost = (extra = "") =>
  cn(
    "flex h-9 shrink-0 items-center gap-1 rounded-input border border-border bg-surface px-3.5",
    "text-[15px] text-text transition-colors hover:bg-surface-2 disabled:opacity-50",
    extra,
  );

export const btnAccent = (extra = "") =>
  cn(
    "flex h-9 shrink-0 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[15px] font-medium",
    "text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50",
    extra,
  );
