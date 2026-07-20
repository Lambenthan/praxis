import { useEffect, useRef, useState } from "react";
import { ChevronRight, ListOrdered } from "lucide-react";
import { STEP_ACTIONS, type StepAction } from "./WorkflowStarters";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";

// The research steps live INSIDE a project — they need a folder with data to
// act on, which is why they are not on the welcome page. Prompts are
// workspace-context: clicking runs directly, nothing to fill in. Two surfaces
// share the same list: the full panel (an empty draft pinned to a folder) and
// a compact menu in the session header (any later moment).

const LANES: { key: StepAction["group"]; label: string }[] = [
  { key: "quant", label: "Quantitative workflow" },
  { key: "qual", label: "Qualitative workflow" },
];

/** Full panel: what an empty, folder-pinned draft shows instead of the
 *  welcome page. Numbered — the order IS the method — but any step can be
 *  clicked directly when the earlier ones are already done by hand. */
export function StepActionsPanel({
  workspaceName,
  onRun,
}: {
  workspaceName: string | null;
  onRun: (prompt: string) => void;
}) {
  const t = useT();
  return (
    <div className="flex min-h-[62vh] flex-col items-center justify-center">
      <div className="w-full max-w-[500px]">
        <div className="text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            {t("Project ready")}
          </div>
          <h2 className="mt-2.5 font-serif text-[22px] leading-tight text-text">
            {workspaceName || t("Your project")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t(
              "Type what you need in your own words — or run a step. They build on each other in order, but you can jump to the one you need.",
            )}
          </p>
        </div>

        {LANES.map((lane) => {
          const steps = STEP_ACTIONS.filter((s) => s.group === lane.key);
          if (steps.length === 0) return null;
          return (
            <div key={lane.key} className="mt-6">
              <div className="mb-1.5 px-1 text-[12px] font-medium text-muted">{t(lane.label)}</div>
              <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
                {steps.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onRun(t(s.prompt))}
                    className="group flex w-full items-center gap-3.5 border-t border-border px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-surface-2"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 font-serif text-[14px] text-accent ring-1 ring-border">
                      {s.seq}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[14px] font-medium text-text">
                        {t(s.title)}
                        {s.badges?.map((b) => (
                          <span
                            key={b}
                            className="rounded bg-surface-2 px-1 py-px text-[10px] font-normal text-muted ring-1 ring-border"
                          >
                            {t(b)}
                          </span>
                        ))}
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted">
                        {t(s.description)}
                      </span>
                    </span>
                    <ChevronRight
                      size={16}
                      className="shrink-0 text-muted/60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted"
                    />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact header menu: the same steps, reachable at any point in the
 *  conversation (step 4 after you did 1–3 yesterday). Sends on click. */
export function StepsMenuButton({ onRun }: { onRun: (prompt: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={t("Research steps — run one against this project's folder")}
        className={cn(
          "flex items-center gap-1 rounded-input px-2 py-0.5 text-xs ring-1 ring-border transition-colors",
          open ? "bg-surface-2 text-text" : "bg-surface text-muted hover:bg-surface-2",
        )}
      >
        <ListOrdered size={12} />
        {t("Steps")}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-[300px] overflow-hidden rounded-card border border-border bg-surface shadow-card">
          {LANES.map((lane) => {
            const steps = STEP_ACTIONS.filter((s) => s.group === lane.key);
            if (steps.length === 0) return null;
            return (
              <div key={lane.key}>
                <div className="border-b border-border bg-surface-2/60 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                  {t(lane.label)}
                </div>
                {steps.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setOpen(false);
                      onRun(t(s.prompt));
                    }}
                    className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left text-[14px] text-text transition-colors last:border-b-0 hover:bg-surface-2"
                  >
                    <span className="w-4 shrink-0 text-center font-serif text-[12px] text-accent">
                      {s.seq}
                    </span>
                    <span className="truncate">{t(s.title)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
