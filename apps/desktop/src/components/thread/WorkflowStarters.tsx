import { Check, ChevronRight, Compass, FlaskConical, FolderOpen, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";
import { dirExists, isTauri, pickFolder, workspaceBase } from "@/lib/tauri";
import { listDir } from "@/lib/artifactFile";
import { abbrevHome, baseName } from "@/components/thread/WorkspaceChip";
import { getRecentWorkspaces, setRecentWorkspaces } from "@/lib/recentWorkspaces";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n";

/** A user's project name → a safe, space-free folder segment. The agent runs
 *  shell commands against this path, so spaces (which break unquoted paths)
 *  become hyphens; path-illegal characters are dropped; Chinese names pass
 *  through. Returns "" when nothing usable is left (caller supplies a fallback). */
export function projectFolderName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 60);
}

export interface WorkflowStarter {
  id: string;
  icon: React.ReactNode;
  /** Which research lane the card belongs to. */
  group: "qual" | "quant";
  /** "fill" prefills the composer for the user to complete (they still press
   *  send); "send" is self-contained and goes out immediately. */
  mode: "fill" | "send";
  /** Small chips after the title, e.g. ["demo"] or ["In progress"]. */
  badges?: string[];
  title: string;
  description: string;
  prompt: string;
  /** Side effect to run before sending the prompt (e.g. install example files). */
  prepare?: () => Promise<void>;
  /** Resident agent the new session should run under (e.g. the navigator). */
  agent?: string;
}

/** Recents show only real, NAMED projects. A dated folder (`2026-07-18-1250`,
 *  the old per-session throwaway) and the pre-projects catch-all bucket (`全库`)
 *  are migration leftovers — never a folder the researcher chose to name and
 *  work in — so they don't belong in the VS-Code welcome list. Filter by
 *  basename; the scan and the localStorage list both pass through this. */
const DATED_FOLDER = /^\d{4}-\d{2}-\d{2}-\d{4}$/;
const LEGACY_BUCKET_NAMES = new Set(["全库"]);
function isNamedProject(path: string): boolean {
  const name = path.split("/").filter(Boolean).pop() ?? "";
  return name !== "" && !DATED_FOLDER.test(name) && !LEGACY_BUCKET_NAMES.has(name);
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
  badges: ["guided"],
  title: "Start a project from zero",
  description: "A new empty folder — begin at the question itself.",
  prompt: "Start a research project and guide me through it step by step.",
  agent: "research-navigator",
};

export const NAVIGATOR_MATERIALS_STARTER: WorkflowStarter = {
  id: "research-project-materials",
  group: "qual", // unused — rendered standalone, not in a group
  mode: "send",
  icon: <FolderOpen size={17} strokeWidth={1.75} />,
  title: "I already have research materials",
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
    id: "demo-quant",
    group: "quant",
    mode: "send",
    badges: ["demo"],
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
    id: "demo-qual",
    group: "qual",
    mode: "send",
    badges: ["demo", "In progress"],
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
];

/** One step of the research workflow, shown INSIDE a project (after a folder
 *  exists). Prompts are workspace-context — the agent reads what is in the
 *  folder, so there is nothing to fill in: clicking runs directly. Ordered:
 *  each numbered quant step builds on the one before it. */
export interface StepAction {
  id: string;
  group: "quant" | "qual";
  /** 1-based position in the lane's sequence. */
  seq: number;
  title: string;
  description: string;
  prompt: string;
  badges?: string[];
}

export const STEP_ACTIONS: StepAction[] = [
  {
    id: "research-design",
    group: "quant",
    seq: 1,
    title: "Research design",
    description: "Reads your data and dictionary, then fixes the design before anything runs.",
    prompt:
      "Read what is in this workspace first — the data files, the variable dictionary or codebook, " +
      "and any notes — then design the study before running anything: a decision-complete research " +
      "design (outcome and key regressor, identification strategy, controls with reasons, sample, " +
      "model list, and the falsification condition), grounded in the actual data. Stop for my " +
      "sign-off before any execution.",
  },
  {
    id: "data-merging",
    group: "quant",
    seq: 2,
    title: "Data merging",
    description: "Merges the raw tables in this folder into one analysis panel, reporting match rates.",
    prompt:
      "Merge the raw data files in this workspace into one analysis panel with Stata: identify the " +
      "candidate tables and the merge keys from the files and the dictionary, confirm the keys with " +
      "me before merging, then merge step by step, reporting each step's match rate (_merge " +
      "tabulation), keeping an audit of unmatched observations, and saving a reproducible merge " +
      "do-file plus the merged panel.",
  },
  {
    id: "data-cleaning",
    group: "quant",
    seq: 3,
    title: "Data cleaning",
    description: "Filters, missing values, winsorizing — every step logged; ends with descriptives.",
    prompt:
      "Clean the analysis data in this workspace with Stata: propose the sample filters this data " +
      "calls for and confirm them with me, handle missing values, winsorize continuous variables at " +
      "1%, and log every step in a do-file with observation counts before and after. Finish with a " +
      "descriptive-statistics table saved as a .csv.",
  },
  {
    id: "baseline-reg",
    group: "quant",
    seq: 4,
    title: "Baseline regressions",
    description: "OLS → clustered SE → fixed effects, into one .qreg table you adjudicate.",
    prompt:
      "Run baseline regressions on the analysis data in this workspace with Stata: take the outcome " +
      "and key regressor from the research design or the dictionary (confirm with me if ambiguous), " +
      "show descriptive statistics first, then fit the baseline menu (OLS, clustered SE, fixed " +
      "effects) into a .qreg results file with every model as a candidate.",
  },
  {
    id: "robustness",
    group: "quant",
    seq: 5,
    title: "Robustness checks",
    description: "Alternative measures, samples, and a placebo — appended beside the baseline.",
    prompt:
      "Run robustness checks on the baseline in this workspace with Stata: an alternative measure " +
      "of the key variable, an alternative sample or window, and a placebo test where one makes " +
      "sense. Append every check as a candidate model to the existing .qreg results file so I can " +
      "adjudicate them against the baseline.",
  },
  {
    id: "methodology-review",
    group: "quant",
    seq: 6,
    title: "Pre-submission review",
    badges: ["Reviewer 2"],
    description: "Five referee lenses over your results file; a written report, models untouched.",
    prompt:
      "Run a pre-submission methodology review on the results file (.qreg) in this workspace: the " +
      "five lenses — claim↔evidence, reproducibility re-run, methodology soundness, an adversarial " +
      "Reviewer 2 that tries to reject the finding, and literature/context — and write me a referee " +
      "report with the blocking issues in priority order. Do not change my models.",
  },
  {
    id: "code-interview",
    group: "qual",
    seq: 1,
    title: "Open coding",
    badges: ["In progress"],
    description: "Open-codes the transcripts in this folder into candidates you adjudicate.",
    prompt:
      "Open-code the interview transcript(s) in this workspace and produce a .qcode file of " +
      "candidate codes for me to adjudicate. If there are several transcripts, list them and ask " +
      "which to start with.",
  },
  {
    id: "export-qdpx",
    group: "qual",
    seq: 2,
    title: "Export to NVivo / MAXQDA",
    badges: ["In progress"],
    description: "Turns the adjudicated .qcode in this folder into a REFI-QDA (.qdpx) package.",
    prompt:
      "Export the adjudicated .qcode file in this workspace as a REFI-QDA .qdpx package that " +
      "NVivo / MAXQDA can import. If no .qcode exists yet, say so instead of inventing one.",
  },
];

// The welcome page carries only PROJECT entries and self-contained demos.
// The research STEPS (design → merge → clean → baseline → robustness → review)
// live INSIDE a project — they depend on a folder existing, so presenting them
// here at the same level as "start a project" misled users into clicking any.

/**
 * Empty-session welcome: a quiet, centered composition in the app's paper
 * aesthetic. The conversation is the point, so the copy invites a message
 * first; the starters below are an optional on-ramp, not a dashboard.
 */
export function WorkflowStarters({ onPick }: { onPick: (prompt: string) => void }) {
  const t = useT();
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);
  // Guided vs autonomous: guided binds the resident navigator to the new
  // session; autonomous (the default) only sets up the folder and leaves the
  // researcher driving. Users flip it here or per-session in the header.
  const guidedMode = useUiStore((s) => s.guidedMode);
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
      if (guidedMode) {
        useRuntimeStore.getState().setDraftAgent(NAVIGATOR_MATERIALS_STARTER.agent ?? null);
        onPick(t(NAVIGATOR_MATERIALS_STARTER.prompt));
      } else {
        // Autonomous: the folder is pinned, nothing is sent, no agent drives —
        // the researcher types their own ask.
        useRuntimeStore.getState().setDraftAgent(null);
        toast.success(t("Folder ready — type what you need, in your own words."));
      }
    } finally {
      setPinning(false);
    }
  };

  // "Start fresh": name the project → create a named folder (default in
  // ~/Desktop/Fishes; the dialog's Change… button picks any parent folder for
  // this one project — the default stays owned by Settings). Naming (not
  // folder-picking) keeps the barrier low and gives every project an identity.
  const [naming, setNaming] = useState(false);
  // Esc closes the dialog from anywhere inside it, not just while the name
  // input itself has focus (e.g. after tabbing to "Change…"/"Cancel").
  useEffect(() => {
    if (!naming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pinning) setNaming(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [naming, pinning]);
  const [projectName, setProjectName] = useState("");
  // Where the project will be created: the default base (shown), or the folder
  // the user picked via Change… (customBase) for this one project.
  const [defaultBase, setDefaultBase] = useState<string | null>(null);
  const [customBase, setCustomBase] = useState<string | null>(null);
  const openNaming = () => {
    setNaming(true);
    if (isTauri && !defaultBase) void workspaceBase().then(setDefaultBase);
  };
  const chooseLocation = async () => {
    const dir = await pickFolder();
    if (dir) setCustomBase(dir);
  };
  const startFresh = async () => {
    if (pinning) return;
    // A project must be named — no dated throwaway folders. Empty stays put.
    const folder = projectFolderName(projectName);
    if (!folder) return;
    setPinning(true);
    try {
      if (customBase) {
        const sep = customBase.includes("\\") ? "\\" : "/";
        await useRuntimeStore.getState().switchWorkspace({
          path: `${customBase.replace(/[\\/]+$/, "")}${sep}${folder}`,
        });
      } else {
        await useRuntimeStore.getState().switchWorkspace({ dated: folder });
      }
      if (guidedMode) {
        useRuntimeStore.getState().setDraftAgent(NAVIGATOR_STARTER.agent ?? null);
        onPick(t(NAVIGATOR_STARTER.prompt));
      } else {
        useRuntimeStore.getState().setDraftAgent(null);
        toast.success(t("Project created — type what you need, in your own words."));
      }
      setNaming(false);
      setProjectName("");
      setCustomBase(null);
    } finally {
      setPinning(false);
    }
  };

  // Recent projects (Claude-Code/VS-Code welcome list) + the soft-gate escape.
  const setBlankWorkspaceOk = useUiStore((s) => s.setBlankWorkspaceOk);
  const workspace = useRuntimeStore((s) => s.workspace);
  const [recents, setRecents] = useState<string[]>(() => (isTauri ? getRecentWorkspaces() : []));
  // Surface existing project folders (a project = a top-level folder holding a
  // literature/ or wiki/), so an upgraded user reopens them from day one. Also
  // prune stored recents whose folder no longer exists — a dead entry would
  // silently RECREATE an empty folder on click (set_workspace mkdirs its
  // target), which reads as data loss ("my project is suddenly empty").
  useEffect(() => {
    if (!isTauri) return;
    void (async () => {
      try {
        const alive: string[] = [];
        for (const p of getRecentWorkspaces()) {
          try {
            if (await dirExists(p)) alive.push(p);
          } catch {
            alive.push(p); // can't verify → keep (pruning is best-effort)
          }
        }
        setRecentWorkspaces(alive);
        const base = await workspaceBase();
        const projs: string[] = [];
        if (base) {
          const dirs = (await listDir("", "base")).filter((e) => e.isDir);
          for (const e of dirs) {
            try {
              const sub = await listDir(e.name, "base");
              if (sub.some((x) => x.isDir && (x.name === "literature" || x.name === "wiki"))) {
                projs.push(`${base}/${e.name}`);
              }
            } catch {
              /* skip */
            }
          }
        }
        setRecents([...new Set([...alive, ...projs])]);
      } catch {
        /* none yet */
      }
    })();
  }, []);
  // Hide migration leftovers (dated scratch folders, the `全库` bucket) — the
  // welcome list is for named projects only.
  const visibleRecents = recents.filter(isNamedProject);
  const enterRecent = (dir: string) => {
    setPinning(true);
    void useRuntimeStore
      .getState()
      .switchWorkspace({ path: dir })
      .finally(() => setPinning(false));
  };

  const pick = (s: WorkflowStarter) => {
    // Trying a demo means working in the blank workspace — dismiss the gate.
    setBlankWorkspaceOk(true);
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
    // A focused modal (VS-Code "open a folder" welcome): a soft backdrop over the
    // empty app, and one card that only lets you open a project — or skip.
    <div className="scrim-in fixed inset-0 z-40 flex items-center justify-center bg-black/20 p-6 backdrop-blur-[1px]">
      <div className="dialog-in max-h-[88vh] w-full max-w-[460px] overflow-y-auto rounded-card border border-border bg-surface p-6 shadow-pop">
        <div className="text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            {t("Open a workspace")}
          </div>
          <h2 className="mt-2.5 font-serif text-[22px] leading-tight text-text">
            {t("Open a project to start")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t(
              "Everything in Fishes lives inside a project folder — your literature, data, notebooks, and conversations together. Create one or open an existing one to begin.",
            )}
          </p>
        </div>

        {/* The guided path first: one distinguished accent-ringed card for the
            researcher who wants to be walked through rather than pick a task.
            Two ways in — a blank folder, or the folder their materials already
            live in. Everything below stays the à-la-carte menu. */}
        <div className="mt-6 overflow-hidden rounded-card border border-accent/40 bg-surface shadow-card">
          <div className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-[14px] font-medium text-text">
            {t("Start a research project")}
          </div>
          {/* Guided mode is hidden for now — every project starts autonomous. */}
          <p className="px-4 pb-2 text-xs leading-snug text-muted">
            {t(
              "You drive. These set up the project folder — the research steps (design, merging, cleaning, regressions…) appear once you are inside the project.",
            )}
          </p>
          {[NAVIGATOR_STARTER, ...(isTauri ? [NAVIGATOR_MATERIALS_STARTER] : [])].map((s) => (
            <button
              key={s.id}
              disabled={pinning}
              onClick={() =>
                s.id === "research-project-materials"
                  ? void startFromMaterials()
                  : s.id === "research-project"
                    ? openNaming()
                    : pick(s)
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
                <span className="text-[14px] font-medium text-text">
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

        {/* Recent projects — reopen one in a click (VS Code welcome list). */}
        {visibleRecents.length > 0 && (
          <div className="mt-6">
            <div className="mb-1.5 px-1 text-[12px] font-medium text-muted">{t("Recent projects")}</div>
            <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
              {visibleRecents.map((p) => (
                <button
                  key={p}
                  disabled={pinning}
                  onClick={() => enterRecent(p)}
                  className="group flex w-full items-center gap-3 border-t border-border px-4 py-2.5 text-left transition-colors first:border-t-0 hover:bg-surface-2 disabled:opacity-60"
                  title={abbrevHome(p)}
                >
                  <FolderOpen size={15} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-text">{baseName(p)}</span>
                  {p === workspace && <Check size={14} className="shrink-0 text-accent" />}
                  <span className="max-w-[45%] shrink-0 truncate text-[11px] text-muted">
                    {abbrevHome(p)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Secondary way out (like VS Code continuing with no folder open): a
            restrained link, not a colloquial nudge. */}
        <div className="mt-5 border-t border-border pt-3 text-center">
          <button
            onClick={() => setBlankWorkspaceOk(true)}
            className="text-[12px] text-muted hover:text-text"
          >
            {t("Continue without a project")}
          </button>
        </div>
      </div>

      {/* Name-your-project dialog for "Start fresh". */}
      {naming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          role="presentation"
          onClick={() => {
            if (!pinning) setNaming(false);
          }}
        >
          <div
            role="dialog"
            aria-label={t("Name your project")}
            className="w-[400px] rounded-card border border-border bg-surface p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-serif text-[16px] text-text">{t("Name your project")}</div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              {t("A folder with this name is created at the location below, so you can always find your work.")}
            </p>

            <input
              autoFocus
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void startFresh();
                if (e.key === "Escape" && !pinning) setNaming(false);
              }}
              placeholder={t("e.g. Patient capital and green transition")}
              className="mt-3 w-full rounded-input border border-border bg-surface px-3 py-2 text-[14px] text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            {/* Where it goes — under the name, since the name is the decision
                and the location is a detail. Change… picks a folder for this
                one project; the default stays owned by Settings. */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[12px] uppercase tracking-wide text-muted">{t("Location")}</span>
              <span
                className="min-w-0 flex-1 truncate rounded-input bg-surface-2 px-2 py-1 font-mono text-[12px] text-muted"
                title={customBase ?? defaultBase ?? ""}
              >
                {abbrevHome(customBase ?? defaultBase)}
              </span>
              <button
                className="shrink-0 rounded-input border border-border px-2 py-1 text-[12px] text-text transition-colors hover:bg-surface-2"
                onClick={() => void chooseLocation()}
                disabled={pinning}
              >
                {t("Change…")}
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-input px-3 py-1.5 text-[14px] text-muted transition-colors hover:text-text disabled:opacity-50"
                onClick={() => {
                  setNaming(false);
                  setProjectName("");
                }}
                disabled={pinning}
              >
                {t("Cancel")}
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-input bg-accent px-4 py-1.5 text-[14px] font-semibold text-accent-fg shadow-card transition-opacity hover:opacity-90 disabled:opacity-50"
                onClick={() => void startFresh()}
                disabled={pinning || !projectName.trim()}
              >
                {pinning && <Loader2 size={13} className="animate-spin" />}
                {t("Create & start")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
