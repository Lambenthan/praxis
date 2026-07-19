import { Check, X } from "lucide-react";
import type { QCodeDoc } from "@/lib/qcode";
import { candidatesOf, codeColor, quoteOf } from "@/lib/qcode";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

export function AdjudicationQueue({
  doc,
  focused,
  onFocus,
  onAdopt,
  onReject,
}: {
  doc: QCodeDoc;
  focused: number | null;
  onFocus: (index: number) => void;
  onAdopt: (index: number) => void;
  onReject: (index: number) => void;
}) {
  const t = useT();
  const candidates = candidatesOf(doc);
  const adoptedCount = doc.annotations.filter((a) => (a.status ?? "adopted") === "adopted").length;
  const total = adoptedCount + candidates.length;
  const pct = total > 0 ? (adoptedCount / total) * 100 : 0;

  if (candidates.length === 0) {
    // The ritual is done: a quiet, confident close rather than a bare line —
    // the whole point of Fishes is that a human finished winnowing the AI's
    // candidates, so finishing should read as an accomplishment.
    return (
      <div className="w-72 shrink-0 border-l border-border p-4">
        <div className="flex flex-col items-center gap-2 pt-8 text-center">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/12 text-accent">
            <Check size={18} strokeWidth={2} />
          </span>
          <div className="text-[12.5px] font-medium text-text">{t("All candidates adjudicated.")}</div>
          {adoptedCount > 0 && (
            <div className="font-mono text-[10.5px] text-muted">
              {adoptedCount} {t("adopted")}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-72 shrink-0 overflow-y-auto border-l border-border p-2">
      <div className="flex items-baseline justify-between px-1 pb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
          {t("Adjudication queue")}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-muted">
          {adoptedCount}/{total}
        </span>
      </div>
      {/* Winnowing progress: how much of the AI's candidate set the researcher
          has ruled on. The deliberate human pass is the product's signature, so
          it gets a quiet meter in the brand accent. */}
      <div className="mx-1 mb-2 h-[3px] overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {candidates.map(({ annotation, index }) => (
        <div
          key={index}
          onClick={() => onFocus(index)}
          className={cn(
            "mb-2 cursor-pointer rounded-card border p-2.5 text-[12px] transition-all",
            focused === index
              ? "border-accent bg-surface shadow-card"
              : "border-border hover:bg-surface-2/60",
          )}
        >
          <div className="mb-1.5 font-serif leading-relaxed text-text">
            “{quoteOf(doc, annotation)}”
          </div>
          <div className="mb-1.5 flex items-center gap-1.5 text-muted">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: codeColor(doc, annotation.code) }}
            />
            <span className="truncate">{annotation.code}</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdopt(index);
              }}
              className="flex items-center gap-1 rounded-input bg-ok/15 px-2.5 py-1 text-[11px] font-medium text-ok transition hover:bg-ok/25 active:scale-[0.97]"
            >
              <Check size={12} /> {t("Adopt")}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReject(index);
              }}
              className="flex items-center gap-1 rounded-input px-2.5 py-1 text-[11px] font-medium text-muted transition hover:bg-error/10 hover:text-error active:scale-[0.97]"
            >
              <X size={12} /> {t("Reject")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
