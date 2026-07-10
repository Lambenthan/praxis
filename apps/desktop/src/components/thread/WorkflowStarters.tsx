import {
  ChevronRight,
  ClipboardList,
  Compass,
  FileOutput,
  FlaskConical,
  FolderOpen,
  Gavel,
  Highlighter,
  Loader2,
  Route,
  ScatterChart,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";
import { isTauri, pickFolder } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n";

export interface WorkflowStarter {
  id: string;
  icon: React.ReactNode;
  /** Which research lane the card belongs to. */
  group: "qual" | "quant";
  /** "fill" prefills the composer for the user to complete (they still press
   *  send); "send" is self-contained and goes out immediately. */
  mode: "fill" | "send";
  /** Small chip after the title, e.g. "demo". */
  badge?: string;
  title: string;
  description: string;
  prompt: string;
  /** Side effect to run before sending the prompt (e.g. install example files). */
  prepare?: () => Promise<void>;
  /** Resident agent the new session should run under (e.g. the navigator). */
  agent?: string;
}

/** The guided on-ramp: a session under the resident research navigator, which
 *  walks the whole project phase by phase off a research-state.json and stops
 *  at every decision that belongs to the researcher. Rendered as a hero card
 *  above the per-task starters — the path for someone who doesn't yet know
 *  which task to ask for. Two ways in: from scratch (new dated folder), or
 *  from a folder that already holds the researcher's data and literature. */
export const NAVIGATOR_STARTER: WorkflowStarter = {
  id: "research-project",
  group: "qual", // unused — rendered standalone, not in a group
  mode: "send",
  icon: <Compass size={17} strokeWidth={1.75} />,
  badge: "guided",
  title: "Start fresh",
  description: "A new empty folder — begin at the question itself.",
  prompt: "Start a research project and guide me through it step by step.",
  agent: "research-navigator",
};

export const NAVIGATOR_MATERIALS_STARTER: WorkflowStarter = {
  id: "research-project-materials",
  group: "qual", // unused — rendered standalone, not in a group
  mode: "send",
  icon: <FolderOpen size={17} strokeWidth={1.75} />,
  title: "Start from my materials",
  description: "Pick the folder that already holds your data and literature.",
  prompt:
    "Start a research project and guide me through it step by step. My materials (data, literature) are already in this workspace — take stock of them first.",
  agent: "research-navigator",
};

/** Scenario cards for the two research lanes: each is a deployed skill's
 *  trigger phrase turned into a button, so a researcher never has to know
 *  the incantation. Cards needing the user's material prefill the composer;
 *  demo cards are self-contained and send at once. */
export const WORKFLOW_STARTERS: WorkflowStarter[] = [
  {
    id: "code-interview",
    group: "qual",
    mode: "fill",
    icon: <Highlighter size={17} strokeWidth={1.75} />,
    title: "Open coding",
    description: "Open coding on a transcript — candidates land in the adjudication workbench.",
    prompt:
      "Open-code this interview and produce a .qcode file:\n\n" +
      "[paste the transcript here, or attach the file with the paperclip]",
  },
  {
    id: "export-qdpx",
    group: "qual",
    mode: "fill",
    icon: <FileOutput size={17} strokeWidth={1.75} />,
    title: "Export to NVivo / MAXQDA",
    description: "Turn an adjudicated .qcode into a REFI-QDA (.qdpx) exchange package.",
    prompt:
      "Export the coding file [open_coding.qcode] in my workspace as a REFI-QDA .qdpx " +
      "package that NVivo / MAXQDA can import.",
  },
  {
    id: "demo-qual",
    group: "qual",
    mode: "send",
    badge: "demo",
    icon: <Sparkles size={17} strokeWidth={1.75} />,
    title: "Code a sample interview",
    description: "A short remote-work interview, coded end to end — adjudicate the result.",
    prompt:
      "Open-code this interview and produce a .qcode file: Interviewee A: It's not that I " +
      "refuse to work on site, it's that the office routine makes me feel like I'm acting. " +
      "I clock in at nine every day, but the real productive stretch is three or four hours; " +
      "the rest of the time I'm performing busyness. Later I quit and took remote contracts, " +
      "and my output actually went up. With nobody watching me, I'm harder on myself.",
  },
  {
    id: "research-design",
    group: "quant",
    mode: "fill",
    icon: <ClipboardList size={17} strokeWidth={1.75} />,
    title: "Research design",
    description:
      "Say you want to know whether patient capital affects a firm's green transition. It fixes the outcome, the identification strategy, the controls, and what would falsify the hypothesis before anything runs.",
    prompt:
      "Design this study before running anything: from my question, produce a decision-complete " +
      "research design (outcome and key regressor, identification strategy, controls with reasons, " +
      "sample, model list, and the falsification condition), grounding in the data and the field's " +
      "conventions, and stop for my sign-off before execution. Question: [what you want to find out]. " +
      "[attach the dta/csv or codebook if you have one]",
  },
  {
    id: "autopilot",
    group: "quant",
    mode: "fill",
    badge: "autopilot",
    icon: <Route size={17} strokeWidth={1.75} />,
    title: "Analyze the dataset",
    description:
      "Hand it a firm-level panel. It runs the data check, traced cleaning, a baseline model menu, and robustness, pausing only to confirm the specification and hand you the candidate table.",
    prompt:
      "Autopilot this dataset end to end with Stata: run the whole empirical pipeline — " +
      "data health check, traced cleaning, a baseline model menu (OLS → clustered SE → " +
      "fixed effects) plus a couple of robustness checks — and stop only to confirm the " +
      "specification with me and to hand me the candidate .qreg. Outcome and key regressor: " +
      "[say what you want explained, or let me propose one]. [attach the dta/csv file]",
  },
  {
    id: "baseline-reg",
    group: "quant",
    mode: "fill",
    icon: <ScatterChart size={17} strokeWidth={1.75} />,
    title: "Baseline regressions",
    description:
      "Say you are testing how years of schooling move log wage. It runs OLS, then clustered standard errors, then fixed effects into one .qreg table.",
    prompt:
      "Run an empirical analysis on my data with Stata: descriptive statistics first for me " +
      "to confirm, then baseline regressions (OLS, clustered SE, fixed effects) into a .qreg " +
      "results file. Outcome variable: [Y]; key regressor: [X]. [attach the dta/csv file]",
  },
  {
    id: "demo-quant",
    group: "quant",
    mode: "send",
    badge: "demo",
    icon: <FlaskConical size={17} strokeWidth={1.75} />,
    title: "Regressions on auto data",
    description:
      "Uses Stata's built-in auto data: price on mpg and weight, three models, straight into the adjudication workbench.",
    prompt:
      "Using Stata's built-in demo data (sysuse auto), run an empirical demo: outcome price, " +
      "key regressors mpg and weight; fit plain OLS, then add foreign as a control, then rep78 " +
      "fixed effects via areg; produce a results.qreg file with all models as candidates.",
  },
  {
    id: "methodology-review",
    group: "quant",
    mode: "fill",
    badge: "Reviewer 2",
    icon: <Gavel size={17} strokeWidth={1.75} />,
    title: "Pre-submission review",
    description:
      "Hand it your results.qreg. Five referee lenses catch problems like standard errors clustered at the wrong level, or a finding that holds in only one specification.",
    prompt:
      "Run a pre-submission methodology review on my results file [results.qreg] in the workspace: " +
      "the five lenses — claim↔evidence, reproducibility re-run, methodology soundness, an adversarial " +
      "Reviewer 2 that tries to reject the finding, and literature/context — and write me a referee " +
      "report with the blocking issues in priority order. Do not change my models.",
  },
];

// Quantitative leads — it is the lane being built out first, so the menu
// presents it first; qualitative stays available below.
const GROUPS: { key: WorkflowStarter["group"]; label: string }[] = [
  { key: "quant", label: "Quantitative research" },
  { key: "qual", label: "Qualitative research" },
];

/**
 * Empty-session welcome: a quiet, centered composition in the app's paper
 * aesthetic. The conversation is the point, so the copy invites a message
 * first; the starters below are an optional on-ramp, not a dashboard.
 */
export function WorkflowStarters({ onPick }: { onPick: (prompt: string) => void }) {
  const t = useT();
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);
  // "Start from my materials": native folder pick → pin it as the session's
  // workspace (sidecar restart, a few seconds) → then the guided prompt.
  const [pinning, setPinning] = useState(false);
  const startFromMaterials = async () => {
    if (pinning) return;
    const dir = await pickFolder();
    if (!dir) return; // cancelled — no session, no prompt
    setPinning(true);
    try {
      await useRuntimeStore.getState().switchWorkspace({ path: dir });
      useRuntimeStore.getState().setDraftAgent(NAVIGATOR_MATERIALS_STARTER.agent ?? null);
      onPick(t(NAVIGATOR_MATERIALS_STARTER.prompt));
    } finally {
      setPinning(false);
    }
  };

  const pick = (s: WorkflowStarter) => {
    void (async () => {
      try {
        await s.prepare?.();
      } catch (e) {
        toast.error(
          `${t("Could not set up the example:")} ${e instanceof Error ? e.message : String(e)}`,
        );
        return;
      }
      // A starter with a resident agent binds it to the session about to be
      // created — the whole conversation runs under that agent.
      useRuntimeStore.getState().setDraftAgent(s.agent ?? null);
      // Template cards land in the composer for the user to complete; only
      // self-contained demos send immediately.
      if (s.mode === "fill") setComposerDraft(t(s.prompt));
      else onPick(t(s.prompt));
    })();
  };

  return (
    <div className="flex min-h-[62vh] flex-col items-center justify-center">
      <div className="w-full max-w-[500px]">
        <div className="text-center">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-muted">
            {t("New session")}
          </div>
          <h2 className="mt-2.5 font-serif text-[26px] leading-tight text-text">
            {t("What should we look into?")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t("Describe your analysis below — or start from one of these.")}
          </p>
        </div>

        {/* The guided path first: one distinguished accent-ringed card for the
            researcher who wants to be walked through rather than pick a task.
            Two ways in — a blank folder, or the folder their materials already
            live in. Everything below stays the à-la-carte menu. */}
        <div className="mt-6 overflow-hidden rounded-card border border-accent/40 bg-surface shadow-card">
          <div className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-[13.5px] font-medium text-text">
            {t("Start a research project")}
            <span className="rounded bg-accent/10 px-1 py-px text-[10px] font-normal text-accent ring-1 ring-accent/30">
              {t("guided")}
            </span>
          </div>
          <p className="px-4 pb-2 text-xs leading-snug text-muted">
            {t(
              "A resident navigator walks you through the whole project — framing, gap check, design, analysis, review — pausing at every decision that is yours.",
            )}
          </p>
          {[NAVIGATOR_STARTER, ...(isTauri ? [NAVIGATOR_MATERIALS_STARTER] : [])].map((s) => (
            <button
              key={s.id}
              disabled={pinning}
              onClick={() =>
                s.id === "research-project-materials" ? void startFromMaterials() : pick(s)
              }
              className="group flex w-full items-center gap-3.5 border-t border-border px-4 py-3 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent ring-1 ring-accent/30 transition-colors group-hover:bg-surface">
                {pinning && s.id === "research-project-materials" ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  s.icon
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-[13.5px] font-medium text-text">
                  {pinning && s.id === "research-project-materials"
                    ? t("Switching…")
                    : t(s.title)}
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

        {GROUPS.map((g) => (
          <div key={g.key} className="mt-6">
            <div className="mb-1.5 px-1 text-[11px] font-medium text-muted">{t(g.label)}</div>
            <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
              {WORKFLOW_STARTERS.filter((s) => s.group === g.key).map((s) => (
                <button
                  key={s.id}
                  onClick={() => pick(s)}
                  className="group flex w-full items-center gap-3.5 border-t border-border px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-surface-2"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-accent ring-1 ring-border transition-colors group-hover:bg-surface">
                    {s.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-text">
                      {t(s.title)}
                      {s.badge && (
                        <span className="rounded bg-surface-2 px-1 py-px text-[10px] font-normal text-muted ring-1 ring-border">
                          {t(s.badge)}
                        </span>
                      )}
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
        ))}
      </div>
    </div>
  );
}
