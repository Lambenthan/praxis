// Plan-as-report: parse the agent-written plan files. The agent writes an
// immutable `plan.json` (the task plan) at the workspace root when a
// multi-step task starts, then overlays live progress in `plan-status.json`
// as it works — the same file-based convention as research-state.json, so no
// hidden tool-call channel is needed. Pure and transport-agnostic for unit
// testing; the UI reads the files through readArtifact.

export const PLAN_FILE = "plan.json";
export const PLAN_STATUS_FILE = "plan-status.json";

/** A step's lifecycle. "pending" is the default for steps the status overlay
 *  doesn't mention — the agent only writes the states it has entered. */
export type StepStatus = "pending" | "in_progress" | "completed" | "skipped" | "blocked";

export interface PlanStep {
  /** Stable id (s1, s2, …) the status overlay keys by. Synthesized from the
   *  phase when the agent omitted it, so title-fallback matching still works. */
  id: string;
  title: string;
  description?: string;
}

export interface PlanPhase {
  id: string;
  name: string;
  dependsOn: string[];
  steps: PlanStep[];
}

export interface Plan {
  version?: number;
  taskSummary?: string;
  createdAt?: string;
  phases: PlanPhase[];
  desiredOutputs: string[];
  feasibility?: { confidence?: string; rationale?: string };
}

export interface PlanStepStatus {
  status: StepStatus;
  /** One-sentence concrete result ("located 214/230 sentences…") — the gray
   *  italic RESULT line under a step. */
  note?: string;
}

export interface PlanStatus {
  steps: Record<string, PlanStepStatus>;
}

const STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "in_progress",
  "completed",
  "skipped",
  "blocked",
] satisfies StepStatus[]);

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function parseStep(v: unknown, fallbackId: string): PlanStep | null {
  const o = asRecord(v);
  if (!o) return null;
  const title = asString(o.title) ?? asString(o.name);
  if (!title) return null;
  return { id: asString(o.id) ?? fallbackId, title, description: asString(o.description) };
}

/**
 * Parse plan.json. Tolerant: anything that isn't a JSON object with at least
 * one phase containing at least one titled step returns null (the chip/panel
 * just hide). Accepts steps directly on a phase, and — Claude Science's
 * version-3 shape — nested one level down under `delegations`.
 */
export function parsePlan(text: string): Plan | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const o = asRecord(raw);
  if (!o || !Array.isArray(o.phases)) return null;

  const phases: PlanPhase[] = [];
  o.phases.forEach((p, pi) => {
    const po = asRecord(p);
    if (!po) return;
    const id = asString(po.id) ?? `phase-${pi}`;
    const stepSources: unknown[] = Array.isArray(po.steps) ? [...po.steps] : [];
    if (Array.isArray(po.delegations))
      for (const d of po.delegations) {
        const dSteps = asRecord(d)?.steps;
        if (Array.isArray(dSteps)) stepSources.push(...dSteps);
      }
    const steps = stepSources
      .map((s, si) => parseStep(s, `${id}-s${si + 1}`))
      .filter((s): s is PlanStep => s !== null);
    if (steps.length === 0) return; // a phase with no readable steps renders nothing
    phases.push({
      id,
      name: asString(po.name) ?? id,
      dependsOn: Array.isArray(po.depends_on)
        ? po.depends_on.filter((x): x is string => typeof x === "string")
        : [],
      steps,
    });
  });
  if (phases.length === 0) return null;

  const feasRaw = asRecord(o.feasibility);
  return {
    version: typeof o.version === "number" ? o.version : undefined,
    taskSummary: asString(o.task_summary),
    createdAt: asString(o.created_at),
    phases,
    desiredOutputs: Array.isArray(o.desired_outputs)
      ? o.desired_outputs.filter((x): x is string => typeof x === "string" && !!x.trim())
      : [],
    feasibility: feasRaw
      ? { confidence: asString(feasRaw.confidence), rationale: asString(feasRaw.rationale) }
      : undefined,
  };
}

/** Parse plan-status.json. Bad JSON / wrong shape → null; entries with an
 *  unknown status are dropped (they read as pending). */
export function parsePlanStatus(text: string): PlanStatus | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const stepsRaw = asRecord(asRecord(raw)?.steps);
  if (!stepsRaw) return null;
  const steps: Record<string, PlanStepStatus> = {};
  for (const [key, v] of Object.entries(stepsRaw)) {
    const o = asRecord(v);
    const status = asString(o?.status);
    if (!o || !status || !STATUSES.has(status)) continue;
    const note = asString(o.note);
    steps[key] = note ? { status: status as StepStatus, note } : { status: status as StepStatus };
  }
  return { steps };
}

/**
 * The overlay entry for a step: matched by stable id, falling back to the
 * exact title (agents sometimes key the overlay by title — CS matches by
 * title ONLY, which is brittle; here the title is just the safety net).
 */
export function stepStatus(step: PlanStep, status: PlanStatus | null): PlanStepStatus {
  return status?.steps[step.id] ?? status?.steps[step.title] ?? { status: "pending" };
}

/** All steps across phases, in plan order. */
export function flattenSteps(plan: Plan): PlanStep[] {
  return plan.phases.flatMap((p) => p.steps);
}

export interface PlanProgress {
  /** Steps that no longer need doing (completed + skipped). */
  done: number;
  total: number;
  /** The step being worked (first in_progress), else the first still-open one. */
  current: PlanStep | null;
}

export function planProgress(plan: Plan, status: PlanStatus | null): PlanProgress {
  const steps = flattenSteps(plan);
  let done = 0;
  let current: PlanStep | null = null;
  let firstOpen: PlanStep | null = null;
  for (const step of steps) {
    const st = stepStatus(step, status).status;
    if (st === "completed" || st === "skipped") done++;
    else if (st === "in_progress" && !current) current = step;
    else if ((st === "pending" || st === "blocked") && !firstOpen) firstOpen = step;
  }
  return { done, total: steps.length, current: current ?? firstOpen };
}
