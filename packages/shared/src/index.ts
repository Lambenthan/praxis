// Stable domain types for AI4S Workbench.
// Imported by the desktop app now, and by the SDK / runtime in later slices.

export type RuntimeStatus = "connecting" | "ready" | "error" | "offline";
export type ModelStatus = "connected" | "disconnected" | "error";

export interface Project {
  id: string;
  name: string;
  sessions: Session[];
}

export type SessionGroup = "Examples" | "Today" | "Active" | "Earlier";

export interface Session {
  id: string;
  projectId: string;
  title: string;
  group: SessionGroup;
  /** Optional right-aligned count badge, e.g. running agents. */
  badge?: number;
  /** Status dot color hint. */
  status?: "idle" | "running" | "done" | "warn";
  blocks: ThreadBlock[];
  inspector?: Inspector;
}

// ---- Thread blocks (center pane) ----

export type ThreadBlock =
  | UserMessageBlock
  | AgentMessageBlock
  | StepSummaryBlock
  | ToolCallBlock
  | ReviewerBlock
  | CodingStepBlock
  | DataTableBlock
  | FigureBlock
  | ArtifactBlock
  | RunningJobsBlock
  | StatusLineBlock;

export interface UserMessageBlock {
  kind: "user";
  text: string;
}

export interface AgentMessageBlock {
  kind: "agent";
  /** Markdown; inline `code` tokens are rendered as blue mono. */
  markdown: string;
}

export interface StepSummaryBlock {
  kind: "step-summary";
  summary: string;
  steps: number;
  details?: string[];
}

export type ToolCallStatus =
  | "pending"
  | "running"
  | "waiting-approval"
  | "success"
  | "warning"
  | "failed";

export interface ToolCallBlock {
  kind: "tool-call";
  title: string;
  status: ToolCallStatus;
  /** Right-aligned meta, e.g. "142 lines of output" or "16m 2s". */
  meta?: string;
  inputSummary?: string;
  outputSummary?: string;
  /** The step's complete captured output — every row with one expands to the
   *  full record, so a long install or analysis is never a black box. */
  output?: string;
  /** The raw command/input the step ran (e.g. the bash line), shown verbatim in
   *  the expanded card's code block — distinct from the tidied `title`. */
  command?: string;
  /** The runtime tool name (e.g. "bash"), used to label the card's language. */
  tool?: string;
  /** Subagent session spawned by this task tool — lets the UI show its live activity. */
  childSessionId?: string;
}

export type FindingLevel = "warn" | "ok" | "error";

/**
 * Which check produced a finding: P0-4's three traceability audits, `domain`
 * for P0-5's domain-correctness gates, and `integrity` for P1-6's
 * analysis-integrity gate. `domain`/`integrity` findings carry their own `tag`
 * (e.g. "physics · units", "stats · prereg") so new checks need no UI change.
 */
export type ReviewCheck = "citation" | "number" | "figure" | "domain" | "integrity";

export interface ReviewFinding {
  level: FindingLevel;
  title: string;
  /** Monospace evidence body. */
  evidence?: string;
  check?: ReviewCheck;
  /** Freeform label shown on the card, overriding the check name (used by
   *  domain-correctness findings, e.g. "earth · crs"). */
  tag?: string;
}

export interface ReviewerBlock {
  kind: "reviewer";
  findings: ReviewFinding[];
  note?: string;
}

/**
 * One open-coding decision the agent streams as it works: a code assigned to a
 * verbatim source span, with the coder's rationale. The agent emits these as
 * ```coding fenced JSON blocks; the thread renders each as a card that appears
 * as it streams — a live, segment-by-segment feed of the coding in progress.
 * The persistent artifact is still the final `.qcode` file; these are the
 * in-flight view.
 */
export interface CodingStepBlock {
  kind: "coding-step";
  /** The verbatim source span this code applies to (sliced from source, never invented). */
  quote: string;
  /** The code assigned to that span. */
  code: string;
  /** The coder's rationale / interpretive note for this assignment. */
  memo?: string;
  /** Optional source label (interview id/title) the quote came from. */
  source?: string;
}

export interface DataTableBlock {
  kind: "table";
  columns: string[];
  /** Cells rendered with mono where they look code-like. */
  rows: string[][];
  caption?: string;
}

export interface FigureBlock {
  kind: "figure";
  title: string;
  /** Image URL / data URI; a placeholder this slice. */
  src: string;
  caption?: string;
  /** Reviewer/user pins dropped on the figure. */
  annotations?: FigureAnnotation[];
}

export interface FigureAnnotation {
  index: number;
  note: string;
  /** Percent position of the pin within the image. */
  x: number;
  y: number;
}

/** File the agent produced, surfaced as a traceable artifact in the thread. */
export type ArtifactKind =
  | "figure"
  | "script"
  | "report"
  | "table"
  | "notebook"
  | "model"
  | "data";

export interface ArtifactBlock {
  kind: "artifact";
  /** Workspace-relative path the tool wrote. */
  path: string;
  filename: string;
  artifact: ArtifactKind;
  /** Tool that produced it, e.g. "write" / "edit". */
  tool: string;
  /** Text content when the producing tool carried it (write/edit); absent for binary. */
  content?: string;
  language?: string;
  /** Folder tree `path` resolves in (default "workspace"). Example sessions
   *  point their bundled real files at the base tree. */
  root?: FileRoot;
}

export interface RunningJob {
  label: string;
  elapsed: string;
}

export interface RunningJobsBlock {
  kind: "running-jobs";
  title: string; // e.g. "REMOTE · 8"
  jobs: RunningJob[];
}

export interface StatusLineBlock {
  kind: "status-line";
  text: string; // e.g. "8 running · 16m 2s"
  tone?: "running" | "done" | "review" | "error";
  /** A finished turn's token/cost summary, shown as a faint right-aligned
   *  footer under the reply. Present only on usage footers. */
  usage?: { tokens: number; cost?: number; messageId?: string };
}

// ---- Inspector (right pane) ----

export type Inspector =
  | ArtifactInspector
  | NotebookInspector
  | FilePreviewInspector
  | NotebookFileInspector;

/** Folder tree a root-relative file path resolves in: the active session
 *  workspace (default) or the base folder all session workspaces live under. */
export type FileRoot = "workspace" | "base";

/** A real .ipynb in the workspace, opened in the runnable notebook editor. */
export interface NotebookFileInspector {
  variant: "notebook-file";
  /** Root-relative path of the notebook. */
  path: string;
  /** Folder tree `path` resolves in (default "workspace"). */
  root?: FileRoot;
}

/** A workspace file surfaced for preview — the agent wrote it OR code produced it.
 *  Rendered by type: HTML → live iframe, PDF → pdf.js, image → <img>, text → code. */
export interface FilePreviewInspector {
  variant: "file";
  path: string;
  filename: string;
  artifact: ArtifactKind;
  language?: string;
  /** Inline text content when known (write/edit tools); else loaded from disk. */
  content?: string;
  /** Folder tree `path` resolves in (default "workspace"). */
  root?: FileRoot;
}

export interface ArtifactVersion {
  label: string; // "v1", "v2"
  /** Per-version overrides; fall back to the inspector-level fields when absent. */
  code?: string;
  executionLog?: string;
  messages?: string[];
  environment?: string;
  reviewPassed?: boolean;
}

export type ArtifactTab =
  | "Code"
  | "Execution Log"
  | "Messages"
  | "Environment"
  | "Review";

export type ArtifactType =
  | "figure"
  | "report"
  | "table"
  | "script"
  | "notebook"
  | "pdf";

export interface ArtifactInspector {
  variant: "artifact";
  title: string;
  /** Name used when downloading the script (defaults to `title`). */
  filename?: string;
  versions: ArtifactVersion[];
  activeVersion: string;
  reviewPassed?: boolean;
  inputs: string[];
  /** Source shown in the Code tab. */
  code: string;
  language: string;
  /** First line number to show. */
  codeStartLine?: number;
  executionLog?: string;
  environment?: string;
  messages?: string[];
}

export interface NotebookCell {
  index: number;
  language: string;
  code: string;
  output?: string;
  /** Base64 PNG from a display_data/execute_result output (e.g. a matplotlib figure). */
  image?: string;
  /** Raw `text/html` output (e.g. a pandas DataFrame's rich table), sanitized before render. */
  html?: string;
}

export interface NotebookInspector {
  variant: "notebook";
  name: string;
  live: boolean;
  kernelLabel: string;
  kernelNote: string;
  cells: NotebookCell[];
}

// ---- Provenance / citations ----

/** One recorded write of an artifact — a line in `.openscience/provenance.jsonl`.
 *  Every agent write appends one, so any artifact can reveal its generating
 *  code, environment, and originating conversation, per version. */
export interface ProvenanceRecord {
  /** Workspace-relative artifact path with `/` separators. */
  path: string;
  /** 1-based version, assigned on append. */
  version: number;
  /** Seconds since the epoch. */
  ts: number;
  /** Tool that produced this version, e.g. "write". */
  tool: string;
  sessionId?: string;
  /** Model configured when the version was recorded. */
  model?: string;
  /** Text the tool wrote (capped); absent for binary or indirect writes. */
  content?: string;
  log?: string;
  /** Runtime environment captured when the version was recorded. */
  env?: ProvenanceEnv;
}

/** The environment a version was produced in — enough to reproduce. */
export interface ProvenanceEnv {
  /** Local Python version, e.g. "3.12.4". */
  python?: string;
  /** OS and architecture, e.g. "macos-aarch64". */
  platform: string;
  /** Open Science app version that recorded it. */
  app: string;
  /** Installed Python packages (pip freeze), content-addressed to a lockfile. */
  packages?: PackageSnapshot;
}

export interface PackageSnapshot {
  /** Number of installed packages captured. */
  count: number;
  /** Short content hash; the lockfile is `.openscience/env/<hash>.txt`. */
  hash: string;
}

export interface Citation {
  id: string; // DOI / PMID / arXiv id
  title: string;
  year?: number;
  source?: string;
}

// ---- Chart design system (P1-5) ----
// One validated palette, the single source of truth for BOTH native app charts
// (SVG stat tiles, mini-bars) and agent-generated figures (matplotlib, via the
// bundled `openscience.mplstyle` which carries the same hexes). Validated with
// the dataviz skill against the app's real surfaces — light #ffffff, dark
// #1e1d24 — for the lightness band, chroma floor, CVD separation, and contrast.
// Categorical hues are assigned in this fixed order, never cycled.

export type ChartTheme = "light" | "dark";

export interface ChartPalette {
  /** Categorical series hues, in fixed assignment order (identity encoding). */
  categorical: string[];
  /** Single-hue sequential ramp, light→dark (magnitude encoding). */
  sequential: string[];
  /** Reserved state colors — never reused as a series hue. */
  status: { good: string; warning: string; serious: string; critical: string };
}

/** Light-mode palette (chart surface #ffffff). */
export const CHART_PALETTE_LIGHT: ChartPalette = {
  categorical: ["#2a78d6", "#1baf7a", "#eda100", "#008300", "#4a3aa7", "#e34948", "#e87ba4", "#eb6834"],
  sequential: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#104281"],
  status: { good: "#0ca30c", warning: "#c98a2b", serious: "#ec835a", critical: "#d03b3b" },
};

/** Dark-mode palette — the same hues stepped for the dark surface (#1e1d24). */
export const CHART_PALETTE_DARK: ChartPalette = {
  categorical: ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767", "#d55181", "#d95926"],
  sequential: ["#104281", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"],
  status: { good: "#0ca30c", warning: "#d7a24a", serious: "#ec835a", critical: "#d03b3b" },
};

export function chartPalette(theme: ChartTheme): ChartPalette {
  return theme === "dark" ? CHART_PALETTE_DARK : CHART_PALETTE_LIGHT;
}

/** Categorical hue for series `i`, assigned in fixed order (wraps only past 8). */
export function seriesColor(i: number, theme: ChartTheme): string {
  const c = chartPalette(theme).categorical;
  return c[((i % c.length) + c.length) % c.length];
}
