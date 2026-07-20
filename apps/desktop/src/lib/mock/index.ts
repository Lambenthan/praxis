import type { HistoryMessage } from "@fishes/sdk";
import type { ArtifactBlock, ArtifactKind, Project, Session, ThreadBlock } from "@fishes/shared";
import { historyToThread } from "@/lib/runtime";

// Three read-only example sessions — the COMPLETE transcripts of real runs of
// this app (exported from its session store: every message and tool call as it
// happened, long tool dumps truncated, local paths scrubbed), plus the REAL
// files those runs produced. Opening an example materializes its artifact
// folder under `<workspace base>/examples/<run>` (install_example, idempotent)
// and every file card opens the genuine file through the same preview path a
// live session uses — the PDF is the real PDF, the Word file is the real Word
// file. Nothing here is a mock-up.
//
// The transcripts are loaded via `import.meta.glob` rather than static
// imports because they are OPTIONAL at build time: the open-core public
// shell does not ship them (their tool-output content can embed real
// skill-loading traces from the proprietary layer — see
// scripts/release/publish-shell.sh's step 2.5). A glob with zero matches
// builds cleanly to an empty object; a static `import x from "…json"` would
// fail the build outright if the file is absent.
interface StoredSession {
  title: string;
  history: HistoryMessage[];
}

const transcripts = import.meta.glob<StoredSession>("../../assets/examples/session-*.json", {
  eager: true,
  import: "default",
});

function storedSession(name: string): StoredSession | undefined {
  const entry = Object.entries(transcripts).find(([path]) => path.endsWith(`session-${name}.json`));
  return entry?.[1];
}

/** Which bundled artifact folder each example session materializes and reads. */
export const EXAMPLE_DIRS: Record<string, string> = {
  "figure-canvas": "figure",
  "scvi-sweep": "regression",
  "lit-review": "review",
};

/** A real bundled file as a clickable artifact card, resolved in the base
 *  folder tree (`<base>/examples/<dir>/<filename>`). */
function realFile(dir: string, filename: string, artifact: ArtifactKind): ArtifactBlock {
  return {
    kind: "artifact",
    path: `examples/${dir}/${filename}`,
    filename,
    artifact,
    tool: "run",
    root: "base",
  };
}

/** Transcript blocks + a closing "these are the real deliverables" section. */
function blocksOf(stored: StoredSession, note: string, deliverables: ArtifactBlock[]): ThreadBlock[] {
  return [
    ...historyToThread(stored.history).blocks,
    { kind: "agent", markdown: note },
    ...deliverables,
  ];
}

const figureStored = storedSession("figure");
const regressionStored = storedSession("regression");
const reviewStored = storedSession("review");

// ---- Session 1: one casual prompt → a publication-grade figure ----

const figureSession: Session | undefined = figureStored && {
  id: "figure-canvas",
  projectId: "fishes-examples",
  title: figureStored.title,
  group: "Examples",
  status: "done",
  blocks: blocksOf(
    figureStored,
    "以下是这次运行产出的真实文件(点开即为原件):",
    [
      realFile("figure", "fig_education_wage.png", "figure"),
      realFile("figure", "plot_eduwage.py", "script"),
      realFile("figure", "export_nlsw88.do", "script"),
      realFile("figure", "nlsw88.csv", "data"),
    ],
  ),
  inspector: {
    variant: "file",
    root: "base",
    path: "examples/figure/fig_education_wage.png",
    filename: "fig_education_wage.png",
    artifact: "figure",
  },
};

// ---- Session 2: one vague prompt → a six-spec model menu into .qreg ----

const regressionSession: Session | undefined = regressionStored && {
  id: "scvi-sweep",
  projectId: "fishes-examples",
  title: regressionStored.title,
  group: "Examples",
  status: "done",
  blocks: blocksOf(
    regressionStored,
    "以下是这次运行产出的真实文件(点开即为原件):",
    [
      realFile("regression", "results.qreg", "table"),
      realFile("regression", "coef_grade.png", "figure"),
      realFile("regression", "scatter_edu.png", "figure"),
      realFile("regression", "analysis.do", "script"),
    ],
  ),
  inspector: {
    variant: "file",
    root: "base",
    path: "examples/regression/results.qreg",
    filename: "results.qreg",
    artifact: "table",
  },
};

// ---- Session 3: literature review → journal PDF + Word ----

const litSession: Session | undefined = reviewStored && {
  id: "lit-review",
  projectId: "fishes-examples",
  title: reviewStored.title,
  group: "Examples",
  status: "done",
  blocks: blocksOf(
    reviewStored,
    "以下是这次运行产出的真实文件(点开即为原件——PDF、Word、TeX、文献库都是当次生成的原文件):",
    [
      realFile("review", "patient_capital_review.pdf", "report"),
      realFile("review", "patient_capital_review_journal.docx", "report"),
      realFile("review", "patient_capital_review.tex", "script"),
      realFile("review", "patient_capital_references.bib", "data"),
      realFile("review", "naixin_capital_papers.md", "report"),
    ],
  ),
  inspector: {
    variant: "file",
    root: "base",
    path: "examples/review/patient_capital_review.pdf",
    filename: "patient_capital_review.pdf",
    artifact: "report",
  },
};

export const mockProject: Project = {
  id: "fishes-examples",
  name: "Fishes 示例",
  sessions: [figureSession, regressionSession, litSession].filter((s): s is Session => s !== undefined),
};

export const mockProjects: Project[] = [mockProject];

export function findSession(sessionId: string): Session | undefined {
  return mockProject.sessions.find((s) => s.id === sessionId);
}

export const defaultSessionId = (litSession ?? mockProject.sessions[0])?.id;
