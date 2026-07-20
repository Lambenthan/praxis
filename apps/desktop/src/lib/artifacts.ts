// Turn the agent's file-writing tool calls into traceable artifacts.
// Pure and transport-agnostic so it can be unit-tested without a live runtime.

import type { ToolUpdatedEvent } from "@fishes/sdk";
import type {
  ArtifactBlock,
  ArtifactInspector,
  ArtifactKind,
  ArtifactVersion,
  FilePreviewInspector,
  NotebookFileInspector,
  ThreadBlock,
} from "@fishes/shared";

const EXT_KIND: Record<string, ArtifactKind> = {
  png: "figure", jpg: "figure", jpeg: "figure", gif: "figure", webp: "figure", svg: "figure",
  fits: "figure", fit: "figure", fts: "figure",
  py: "script", r: "script", jl: "script", sh: "script",
  ipynb: "notebook",
  pdf: "report", tex: "report", md: "report", docx: "report", pptx: "report",
  csv: "table", tsv: "table", parquet: "table", xlsx: "table",
  mol: "data", sdf: "data", smi: "data", smiles: "data",
  bed: "data", bedgraph: "data", bdg: "data", gff: "data", gff3: "data", gtf: "data", vcf: "data",
  stl: "model", obj: "model", ply: "model", gltf: "model", glb: "model",
  dos: "data", qcode: "data", qreg: "table", anom: "figure", eigenval: "data", phase: "figure",
};

const EXT_LANG: Record<string, string> = {
  py: "python", r: "r", jl: "julia", sh: "bash",
  tex: "latex", md: "markdown", csv: "plaintext", tsv: "plaintext",
};

/** Tools whose input names a file path we can surface as an artifact. */
const WRITE_TOOLS = new Set(["write", "edit", "create", "str_replace_editor", "apply_patch"]);

/** Input keys that carry the target file path, in priority order. */
const PATH_KEYS = ["filePath", "path", "file", "filename", "file_path"];
/** Input keys that carry the written text content. */
const CONTENT_KEYS = ["content", "new_str", "text"];

export function extToKind(ext: string): ArtifactKind {
  return EXT_KIND[ext.toLowerCase()] ?? "data";
}

/** Extensions we treat as workspace artifacts worth surfacing/previewing. */
const REF_EXTS = [
  "pdf", "html", "htm", "svg", "png", "jpg", "jpeg", "gif", "webp",
  "csv", "tsv", "md", "tex", "json", "py", "ipynb", "r",
  "docx", "xlsx", "pptx",
  "mol", "mol2", "sdf", "smi", "smiles", "cif", "mcif", "mmcif", "pdb", "pqr", "xyz", "cube",
  "bed", "bedgraph", "bdg", "gff", "gff3", "gtf", "vcf",
  "stl", "obj", "ply", "gltf", "glb",
  "qcode", "qreg",
];
const REF_RE = new RegExp(`[\\w./-]+\\.(?:${REF_EXTS.join("|")})\\b`, "gi");

/**
 * Extract workspace file paths mentioned in an agent message so a file produced by
 * running code (e.g. `canvas-project/canvas.pdf` from a python run) becomes clickable,
 * not just prose. Strips surrounding backticks/quotes; dedupes; ignores URLs.
 */
export function extractArtifactRefs(markdown: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of markdown.matchAll(REF_RE)) {
    const raw = m[0].replace(/^[`'"(]+|[`'".,)]+$/g, "");
    if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith("//")) continue;
    // Require a path-like token or a known ext; skip bare "a.md" sentence fragments only if no slash.
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  html: "text/html", htm: "text/html",
  svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  csv: "text/csv", tsv: "text/tab-separated-values",
  md: "text/markdown", tex: "text/x-tex", json: "application/json",
  py: "text/x-python", r: "text/x-r", txt: "text/plain",
  bed: "text/plain", bedgraph: "text/plain", bdg: "text/plain",
  gff: "text/plain", gff3: "text/plain", gtf: "text/plain", vcf: "text/plain",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function mimeForExt(ext: string): string {
  return MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

export type PreviewKind =
  | "html"
  | "pdf"
  | "image"
  | "table"
  | "markdown"
  | "text"
  | "docx"
  | "xlsx"
  | "pptx"
  | "molecule"
  | "mesh"
  | "genome"
  | "fits"
  | "dos"
  | "qcode"
  | "qreg"
  | "anomaly"
  | "bands"
  | "phase"
  | "wikigraph"
  | "plan";

/** 3D mesh / CAD formats rendered by the three.js viewer. */
export const MESH_EXTS = ["stl", "obj", "ply", "gltf", "glb"];

/** FITS astronomy formats rendered by the native FITS viewer. */
export const FITS_EXTS = ["fits", "fit", "fts"];

/** How a file should be previewed, from its extension. This is the previewer
 *  registry: native webview viewers first (pdf/html/image via the local file
 *  server), lightweight JS renderers second (csv table, docx/xlsx/pptx via
 *  lazy-loaded local renderers), code/text fallback. */
export function previewKind(ext: string): PreviewKind {
  const e = ext.toLowerCase();
  if (e === "html" || e === "htm") return "html";
  if (e === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(e)) return "image";
  if (e === "csv" || e === "tsv") return "table";
  if (e === "md" || e === "markdown") return "markdown";
  if (e === "docx" || e === "xlsx" || e === "pptx") return e;
  if (MESH_EXTS.includes(e)) return "mesh";
  if (FITS_EXTS.includes(e)) return "fits";
  if (e === "dos") return "dos";
  if (e === "qcode") return "qcode";
  if (e === "qreg") return "qreg";
  if (e === "anom") return "anomaly";
  if (e === "eigenval") return "bands";
  if (e === "phase") return "phase";
  if (["mol", "mol2", "sdf", "smi", "smiles", "cif", "mcif", "mmcif", "pdb", "pqr", "xyz", "cube"].includes(e))
    return "molecule";
  if (["bed", "bedgraph", "bdg", "gff", "gff3", "gtf", "vcf"].includes(e)) return "genome";
  return "text";
}

/** Some scientific tools use fixed, extensionless filenames (VASP DOSCAR, …).
 *  Prefer a name match, else fall back to the extension registry. */
export function previewKindForName(filename: string): PreviewKind {
  const base = (filename.split(/[\\/]/).pop() ?? filename).toLowerCase();
  if (base === "doscar" || base.startsWith("doscar.")) return "dos";
  if (base === "eigenval" || base.startsWith("eigenval.")) return "bands";
  // The literature wiki's knowledge graph (wiki/graph/edges.jsonl).
  if (base === "edges.jsonl") return "wikigraph";
  // The agent's task plan + its status overlay render as one report.
  if (base === "plan.json" || base === "plan-status.json") return "plan";
  return previewKind(extOf(filename));
}

/** Build a previewable file-inspector from an artifact surfaced in the thread. */
export function fileInspectorFromBlock(
  a: ArtifactBlock,
): FilePreviewInspector | NotebookFileInspector {
  // Notebooks open in the runnable editor, not the raw-JSON preview.
  if (extOf(a.filename) === "ipynb") return { variant: "notebook-file", path: a.path };
  return {
    variant: "file",
    path: a.path,
    filename: a.filename,
    artifact: a.artifact,
    language: a.language ?? EXT_LANG[extOf(a.filename)],
    content: a.content,
    root: a.root,
  };
}

/** Presentable results, least to most decisive: data tables, then rendered
 *  figures/reports, then the adjudication files that ARE the product. Scripts,
 *  do-files and logs never present themselves. */
const DELIVERABLE_RANKS: RegExp[] = [
  /\.(csv|tsv|xlsx)$/i,
  /\.(png|jpe?g|gif|webp|svg|pdf|docx)$/i,
  /\.(qcode|qreg)$/i,
];

function deliverableRank(filename: string): number {
  return DELIVERABLE_RANKS.findIndex((re) => re.test(filename)) + 1;
}

/**
 * The result the just-finished turn delivered, if any: among files written by
 * a file tool or named in the agent's prose after the last user message, the
 * most decisive kind wins (.qcode/.qreg over figures over tables) and the
 * newest wins within a kind. Scripts write results without a write tool, so a
 * prose mention ("results.qreg is ready") counts as production too.
 */
export function turnDeliverable(blocks: ThreadBlock[]): ArtifactBlock | null {
  let start = 0;
  for (let i = blocks.length - 1; i >= 0; i--)
    if (blocks[i].kind === "user") {
      start = i + 1;
      break;
    }
  let found: ArtifactBlock | null = null;
  let foundRank = 0;
  const consider = (a: ArtifactBlock) => {
    const rank = deliverableRank(a.filename);
    if (rank > 0 && rank >= foundRank) {
      found = a;
      foundRank = rank;
    }
  };
  for (const b of blocks.slice(start)) {
    if (b.kind === "artifact") consider(b);
    else if (b.kind === "agent")
      for (const ref of extractArtifactRefs(b.markdown)) consider(refToArtifactBlock(ref));
  }
  return found;
}

/** A minimal artifact block for a file referenced in prose (path only, no inline content). */
export function refToArtifactBlock(path: string): ArtifactBlock {
  const filename = path.split(/[\\/]/).pop() || path;
  return {
    kind: "artifact",
    path,
    filename,
    artifact: extToKind(extOf(filename)),
    tool: "output",
    language: EXT_LANG[extOf(filename)],
  };
}

function firstString(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Derive an artifact from a completed file-writing tool call, or `null` when the
 * event is not a successful write we can trace to a path.
 */
export function deriveArtifact(event: ToolUpdatedEvent): ArtifactBlock | null {
  if (event.status !== "success") return null;
  const tool = (event.tool ?? "").toLowerCase();
  const input = event.input ?? {};

  // Jupyter MCP tools name the notebook they operate on — surface it live.
  if (tool.includes("jupyter")) {
    const nb = firstString(input, ["notebook_path", "path", "document_id"]);
    if (!nb || !nb.endsWith(".ipynb")) return null;
    const filename = nb.split(/[\\/]/).pop() || nb;
    return { kind: "artifact", path: nb, filename, artifact: "notebook", tool: event.tool };
  }

  if (!WRITE_TOOLS.has(tool)) return null;

  const path = firstString(input, PATH_KEYS);
  if (!path) return null;

  const filename = path.split(/[\\/]/).pop() || path;
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot + 1) : "";

  return {
    kind: "artifact",
    path,
    filename,
    artifact: extToKind(ext),
    tool: event.tool,
    content: firstString(input, CONTENT_KEYS),
    language: EXT_LANG[ext.toLowerCase()],
  };
}

/** Resolve the content shown for the active version, falling back to inspector-level fields. */
export function resolveArtifactContent(
  data: ArtifactInspector,
  activeLabel: string,
): {
  code: string;
  executionLog?: string;
  messages?: string[];
  environment?: string;
  reviewPassed?: boolean;
} {
  const v: ArtifactVersion | undefined = data.versions.find((x) => x.label === activeLabel);
  return {
    code: v?.code ?? data.code,
    executionLog: v?.executionLog ?? data.executionLog,
    messages: v?.messages ?? data.messages,
    environment: v?.environment ?? data.environment,
    reviewPassed: v?.reviewPassed ?? data.reviewPassed,
  };
}

/** Build an inspector view for an artifact surfaced live in the thread. */
export function artifactBlockToInspector(a: ArtifactBlock): ArtifactInspector {
  const hasText = typeof a.content === "string";
  return {
    variant: "artifact",
    title: a.filename,
    filename: a.filename,
    versions: [{ label: "v1" }],
    activeVersion: "v1",
    inputs: [],
    language: a.language ?? "plaintext",
    code: hasText
      ? (a.content as string)
      : `# ${a.filename}\n# Binary artifact (${a.artifact}) written to ${a.path}.\n# Open it from the workspace to view.`,
    executionLog: `wrote ${a.path} · via ${a.tool}`,
  };
}
