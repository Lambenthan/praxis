import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, ListChecks, Minus } from "lucide-react";
import type { ArtifactBlock, FileRoot } from "@fishes/shared";
import { readArtifact } from "@/lib/artifactFile";
import {
  PLAN_FILE,
  PLAN_STATUS_FILE,
  parsePlan,
  parsePlanStatus,
  planProgress,
  stepStatus,
  type Plan,
  type PlanProgress,
  type PlanStatus,
  type StepStatus,
} from "@/lib/plan";
import { useRuntimeStore } from "@/lib/runtime";
import { CodeViewer } from "@/components/code-viewer/CodeViewer";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

/** The artifact block the chip opens — plan.json rendered by the plan preview
 *  (FilePreviewInspector routes the filename to PlanPreview). */
export function planArtifactBlock(): ArtifactBlock {
  return {
    kind: "artifact",
    path: PLAN_FILE,
    filename: PLAN_FILE,
    artifact: "data",
    tool: "plan",
    language: "json",
  };
}

async function readPlanPair(
  planPath: string,
  statusPath: string,
  root?: FileRoot,
): Promise<{ plan: Plan | null; status: PlanStatus | null }> {
  const planFile = await readArtifact(planPath, root).catch(() => null);
  const plan = planFile && planFile.encoding === "utf8" ? parsePlan(planFile.data) : null;
  if (!plan) return { plan: null, status: null };
  const statusFile = await readArtifact(statusPath, root).catch(() => null);
  const status = statusFile && statusFile.encoding === "utf8" ? parsePlanStatus(statusFile.data) : null;
  return { plan, status };
}

/**
 * "Step N of M" header chip (CS's plan-as-report surface): shows only when the
 * session workspace carries a plan.json, N = steps done + 1 capped at M.
 * Re-reads when a turn completes (refreshKey) and polls every 5s while a turn
 * runs, so the count advances as the agent works. Clicking opens the plan in
 * the right pane.
 */
/** Load plan progress (re-read on refreshKey, 5s poll while running). Exposed
 *  so the page can gate the whole composer dock row — passing an always-truthy
 *  chip element reserved an EMPTY gray strip on plan-less conversations. */
export function usePlanProgress(refreshKey: string | number, running: boolean): PlanProgress | null {
  const [progress, setProgress] = useState<PlanProgress | null>(null);
  const load = useCallback(async () => {
    const { plan, status } = await readPlanPair(PLAN_FILE, PLAN_STATUS_FILE);
    return plan ? planProgress(plan, status) : null;
  }, []);
  useEffect(() => {
    let alive = true;
    void load().then((p) => alive && setProgress(p));
    if (!running) return () => { alive = false; };
    const id = window.setInterval(() => void load().then((p) => alive && setProgress(p)), 5_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [refreshKey, running, load]);
  return progress;
}

export function PlanChip({
  progress,
  onOpen,
}: {
  progress: PlanProgress | null;
  onOpen: (artifact: ArtifactBlock) => void;
}) {
  const t = useT();
  if (!progress || progress.total === 0) return null;
  const n = Math.min(progress.done + 1, progress.total);
  return (
    <button
      onClick={() => onOpen(planArtifactBlock())}
      className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[12px] font-medium tabular-nums text-accent transition-colors hover:bg-accent/20"
      title={
        progress.current
          ? `${t("Task plan — click to open plan.json")} · ${progress.current.title}`
          : t("Task plan — click to open plan.json")
      }
      data-testid="plan-chip"
    >
      <ListChecks size={12} />
      <span>
        {t("Step {n} of {m}").replace("{n}", String(n)).replace("{m}", String(progress.total))}
      </span>
    </button>
  );
}

/**
 * The plan rendered as a report (CS grammar on our tokens): per phase an
 * uppercase "PHASE N" overline + semibold phase name; per step a status icon,
 * 14px title (dimmed when completed), 13px description, and — when the agent
 * recorded one — the gray italic RESULT line.
 */
export function PlanPanel({ plan, status }: { plan: Plan; status: PlanStatus | null }) {
  const t = useT();
  return (
    <div className="px-5 py-4">
      {plan.taskSummary && (
        <p className="mb-4 text-[13px] leading-relaxed text-text-300">{plan.taskSummary}</p>
      )}
      <div className="flex flex-col gap-5">
        {plan.phases.map((phase, i) => (
          <section key={phase.id}>
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-400">
              {t("Phase")} {i + 1}
            </div>
            <div className="mt-0.5 text-[13.5px] font-semibold text-text-100">{phase.name}</div>
            <ul className="mt-2 flex flex-col gap-2">
              {phase.steps.map((step) => {
                const st = stepStatus(step, status);
                return (
                  <li key={step.id} className="flex gap-2.5" data-status={st.status}>
                    <StepIcon status={st.status} />
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "text-[14px] leading-[1.4]",
                          st.status === "completed" && "text-text-300",
                          st.status === "skipped" && "text-text-400 line-through",
                          (st.status === "pending" || st.status === "in_progress" || st.status === "blocked") &&
                            "text-text-100",
                        )}
                      >
                        {step.title}
                      </div>
                      {step.description && (
                        <div className="text-[13px] leading-[1.45] text-text-300">{step.description}</div>
                      )}
                      {st.note && (
                        <div className="mt-0.5 text-[12px] italic leading-[1.5] text-text-400">{st.note}</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {plan.desiredOutputs.length > 0 && (
        <section className="mt-5 border-t border-border pt-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-400">
            {t("Desired outputs")}
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {plan.desiredOutputs.map((out) => (
              <li key={out} className="text-[13px] leading-[1.45] text-text-200">
                {out}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  // Fixed-width slot so titles align across icon shapes.
  return (
    <span className="flex w-4 shrink-0 justify-center pt-[3px]" aria-hidden>
      {status === "completed" ? (
        <Check size={14} strokeWidth={2} className="text-text-300" />
      ) : status === "in_progress" ? (
        <span className="mt-[4px] h-[7px] w-[7px] animate-pulse rounded-full bg-accent" />
      ) : status === "skipped" ? (
        <Minus size={14} strokeWidth={2} className="text-text-400" />
      ) : status === "blocked" ? (
        <AlertTriangle size={13} strokeWidth={2} className="mt-px text-warn" />
      ) : (
        <span className="mt-[3px] h-[9px] w-[9px] rounded-full border border-text-400" />
      )}
    </span>
  );
}

/**
 * File-preview surface for plan.json / plan-status.json: whichever of the
 * pair was opened, load both (they are siblings in the same folder) and
 * render the PlanPanel. Re-reads on turn completion and polls every 5s while
 * a turn runs, so an open pane tracks the agent live. Falls back to the raw
 * JSON when the plan doesn't parse (the header's Preview/Code toggle is the
 * explicit view-raw escape).
 */
export function PlanPreview({
  path,
  text,
  root,
}: {
  path: string;
  /** The opened file's text, from the inspector — browser-dev fallback. */
  text: string | null;
  root?: FileRoot;
}) {
  const t = useT();
  const isStatusFile = /(^|[\\/])plan-status\.json$/i.test(path);
  const dir = path.slice(0, path.length - (isStatusFile ? PLAN_STATUS_FILE : PLAN_FILE).length);
  const planPath = isStatusFile ? dir + PLAN_FILE : path;
  const statusPath = isStatusFile ? path : dir + PLAN_STATUS_FILE;

  const [pair, setPair] = useState<{ plan: Plan | null; status: PlanStatus | null } | null>(null);
  const running = useRuntimeStore((s) => !!(s.currentId && s.runningSessions[s.currentId]));

  const load = useCallback(async () => {
    const loaded = await readPlanPair(planPath, statusPath, root);
    // Outside the desktop app readArtifact returns null — fall back to the
    // text the inspector already holds for the opened file.
    if (!loaded.plan && !isStatusFile && text) loaded.plan = parsePlan(text);
    if (!loaded.status && isStatusFile && text) loaded.status = parsePlanStatus(text);
    return loaded;
  }, [planPath, statusPath, root, isStatusFile, text]);

  useEffect(() => {
    let alive = true;
    void load().then((p) => alive && setPair(p));
    if (!running) return () => { alive = false; };
    const id = window.setInterval(() => void load().then((p) => alive && setPair(p)), 5_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [load, running]);

  if (!pair) return null; // first read in flight — the inspector already showed its loader
  if (!pair.plan) {
    // No parseable plan.json next to this file — show the raw JSON instead.
    return text !== null ? (
      <div className="p-3">
        <CodeViewer code={text} language="json" />
      </div>
    ) : (
      <div className="p-4 text-sm text-muted">{t("No readable plan.json next to this file.")}</div>
    );
  }
  return <PlanPanel plan={pair.plan} status={pair.status} />;
}
