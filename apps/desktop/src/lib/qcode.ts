// Parser + segmentation for qualitative-coding traceback files (P1-3, social
// science). A `.qcode` file is JSON: source documents, a codebook, and
// annotations that bind a code to an exact [start, end) character span of a
// source. The viewer highlights those spans — every quote is sliced straight
// from the source text, so a code can never point at an invented quote.

export interface QCodeSource {
  id: string;
  title?: string;
  text: string;
}

export interface QCode {
  name: string;
  /** Optional explicit color; otherwise assigned from the app palette by index. */
  color?: string;
  description?: string;
}

export type AnnotationStatus = "candidate" | "adopted";
export type AnnotationProvenance =
  | "ai_proposed" | "human_adopted" | "human_revised" | "human_added";

export interface QAnnotation {
  source: string;
  code: string;
  start: number;
  end: number;
  memo?: string;
  status?: AnnotationStatus;
  provenance?: AnnotationProvenance;
}

export interface QCodeDoc {
  sources: QCodeSource[];
  codes: QCode[];
  annotations: QAnnotation[];
}

/** A contiguous run of source text and the set of codes covering it. */
export interface Segment {
  text: string;
  start: number;
  end: number;
  codes: string[];
}

export interface QCodeParsed extends QCodeDoc {
  /** Annotations that referenced a missing source/code or an out-of-range span. */
  warnings: string[];
  /** Exact quote text for each valid annotation (sliced from the source). */
  quoteOf: (a: QAnnotation) => string;
  countByCode: Record<string, number>;
}

export function parseQCode(text: string): QCodeParsed {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!raw || typeof raw !== "object") throw new Error("expected a JSON object");
  const obj = raw as Record<string, unknown>;
  const sources = Array.isArray(obj.sources) ? (obj.sources as QCodeSource[]) : [];
  const codes = Array.isArray(obj.codes) ? (obj.codes as QCode[]) : [];
  const annotations = Array.isArray(obj.annotations) ? (obj.annotations as QAnnotation[]) : [];
  if (sources.length === 0) throw new Error("no sources — a .qcode file needs a `sources` array");

  const srcById = new Map(sources.map((s) => [s.id, s]));
  const codeNames = new Set(codes.map((c) => c.name));
  const warnings: string[] = [];
  const countByCode: Record<string, number> = {};

  for (const a of annotations) {
    const s = srcById.get(a.source);
    if (!s) {
      warnings.push(`annotation references unknown source "${a.source}"`);
      continue;
    }
    if (!codeNames.has(a.code)) {
      warnings.push(`annotation uses code "${a.code}" not in the codebook`);
    }
    if (
      typeof a.start !== "number" ||
      typeof a.end !== "number" ||
      a.start < 0 ||
      a.end > s.text.length ||
      a.start >= a.end
    ) {
      warnings.push(
        `annotation on "${a.source}" has an out-of-range span [${a.start}, ${a.end}) (source length ${s.text.length})`,
      );
      continue;
    }
    countByCode[a.code] = (countByCode[a.code] ?? 0) + 1;
  }

  return {
    sources,
    codes,
    annotations,
    warnings,
    countByCode,
    quoteOf: (a) => srcById.get(a.source)?.text.slice(a.start, a.end) ?? "",
  };
}

/** True when an annotation's span is in-range for its (existing) source. */
export function spanValid(doc: QCodeDoc, a: QAnnotation): boolean {
  const s = doc.sources.find((x) => x.id === a.source);
  return (
    !!s &&
    typeof a.start === "number" &&
    typeof a.end === "number" &&
    a.start >= 0 &&
    a.end <= s.text.length &&
    a.start < a.end
  );
}

/** Split a source's text into contiguous runs at every annotation boundary and
 *  hand each run's covering annotations to `cover`, which decides how that run's
 *  `codes` field is shaped. The boundary algorithm (span filtering, bounds set,
 *  sort, slicing) is shared; only the per-run projection differs. Only valid
 *  in-range annotations for this source are considered. */
function segmentize<C>(
  doc: QCodeDoc,
  sourceId: string,
  cover: (covering: QAnnotation[]) => C,
): { text: string; start: number; end: number; codes: C }[] {
  const source = doc.sources.find((s) => s.id === sourceId);
  if (!source) return [];
  const text = source.text;
  const spans = doc.annotations.filter((a) => a.source === sourceId && spanValid(doc, a));
  const bounds = new Set<number>([0, text.length]);
  for (const a of spans) {
    bounds.add(a.start);
    bounds.add(a.end);
  }
  const points = [...bounds].sort((x, y) => x - y);
  const segments: { text: string; start: number; end: number; codes: C }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (start >= end) continue;
    const covering = spans.filter((a) => a.start <= start && a.end >= end);
    segments.push({ text: text.slice(start, end), start, end, codes: cover(covering) });
  }
  return segments;
}

/** Split a source's text into contiguous segments at every annotation boundary,
 *  so overlapping codes are rendered without losing any of them. Only valid
 *  in-range annotations for this source are considered. */
export function segmentsFor(doc: QCodeDoc, sourceId: string): Segment[] {
  return segmentize(doc, sourceId, (covering) => [...new Set(covering.map((a) => a.code))]);
}

/** Candidate annotations (status defaults to "adopted" for legacy files),
 *  each paired with its index in doc.annotations so a decision can target it. */
export function candidatesOf(doc: QCodeDoc): { annotation: QAnnotation; index: number }[] {
  return doc.annotations
    .map((annotation, index) => ({ annotation, index }))
    .filter(
      ({ annotation }) =>
        (annotation.status ?? "adopted") === "candidate" && spanValid(doc, annotation),
    );
}

const SERIES = 8; // --series-1..8

/** A code's highlight color: its explicit `color`, else a palette var by index. */
export function codeColor(doc: QCodeDoc, name: string): string {
  const c = doc.codes.find((x) => x.name === name);
  if (c?.color) return c.color;
  const i = doc.codes.findIndex((x) => x.name === name);
  return `var(--series-${(Math.max(0, i) % SERIES) + 1})`;
}

/** Return a new doc with the annotation at `index` marked adopted (human decision). */
export function adoptAnnotation(doc: QCodeDoc, index: number): QCodeDoc {
  return {
    ...doc,
    annotations: doc.annotations.map((a, i) =>
      i === index ? { ...a, status: "adopted" as const, provenance: "human_adopted" as const } : a,
    ),
  };
}

/** Return a new doc with the annotation at `index` removed (rejected). */
export function rejectAnnotation(doc: QCodeDoc, index: number): QCodeDoc {
  return { ...doc, annotations: doc.annotations.filter((_, i) => i !== index) };
}

/** A contiguous run of source text plus the codes covering it, each with status.
 *  Like segmentsFor, but carries status so the workbench can render candidate
 *  spans (dashed) distinctly from adopted spans (solid). */
export interface WbSegment {
  text: string;
  start: number;
  end: number;
  codes: { name: string; status: AnnotationStatus }[];
}

export function workbenchSegments(doc: QCodeDoc, sourceId: string): WbSegment[] {
  // Intentionally NOT deduped by code name: two annotations sharing a code name
  // are each their own row (every one is an independent pending adjudication
  // decision, possibly with a different status), so keep them all — don't
  // "fix" this into a Set.
  return segmentize(doc, sourceId, (covering) =>
    covering.map((a) => ({ name: a.code, status: (a.status ?? "adopted") as AnnotationStatus })),
  );
}

/** The verbatim quote an annotation points at — sliced from its source, never invented. */
export function quoteOf(doc: QCodeDoc, a: QAnnotation): string {
  return doc.sources.find((s) => s.id === a.source)?.text.slice(a.start, a.end) ?? "";
}

/** Serialize a doc back to a .qcode JSON string (for saving adjudication results). */
export function serializeQCode(doc: QCodeDoc): string {
  return JSON.stringify(
    { sources: doc.sources, codes: doc.codes, annotations: doc.annotations },
    null,
    2,
  );
}
