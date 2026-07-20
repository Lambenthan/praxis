import { describe, expect, it } from "vitest";
import {
  adoptAnnotation,
  adoptedAnnotations,
  candidatesOf,
  codebookCsv,
  codeColor,
  excerptsCsv,
  parseQCode,
  quoteOf,
  rejectAnnotation,
  segmentsFor,
  serializeQCode,
  workbenchSegments,
} from "./qcode";

const DOC = JSON.stringify({
  sources: [{ id: "i1", title: "Interview 1", text: "I trust the doctor but fear the cost." }],
  codes: [{ name: "trust" }, { name: "fear" }],
  annotations: [
    { source: "i1", code: "trust", start: 2, end: 18 }, // "trust the doctor"
    { source: "i1", code: "fear", start: 23, end: 36 }, // "fear the cost"
  ],
});

describe("parseQCode", () => {
  it("parses sources, codes, annotations and counts", () => {
    const d = parseQCode(DOC);
    expect(d.sources).toHaveLength(1);
    expect(d.codes.map((c) => c.name)).toEqual(["trust", "fear"]);
    expect(d.countByCode).toEqual({ trust: 1, fear: 1 });
    expect(d.warnings).toEqual([]);
  });

  it("slices the exact quote from the source (never invents text)", () => {
    const d = parseQCode(DOC);
    expect(d.quoteOf(d.annotations[0])).toBe("trust the doctor");
    expect(d.quoteOf(d.annotations[1])).toBe("fear the cost");
  });

  it("warns on an out-of-range span and an unknown code, but does not throw", () => {
    const doc = parseQCode(
      JSON.stringify({
        sources: [{ id: "s", text: "short" }],
        codes: [{ name: "a" }],
        annotations: [
          { source: "s", code: "a", start: 0, end: 999 }, // out of range
          { source: "s", code: "ghost", start: 0, end: 3 }, // unknown code
        ],
      }),
    );
    expect(doc.warnings.some((w) => w.includes("out-of-range"))).toBe(true);
    expect(doc.warnings.some((w) => w.includes("not in the codebook"))).toBe(true);
  });

  it("throws when there are no sources or the JSON is invalid", () => {
    expect(() => parseQCode("{}")).toThrow(/no sources/);
    expect(() => parseQCode("{ not json")).toThrow(/not valid JSON/);
  });
});

describe("segmentsFor", () => {
  it("splits text at annotation boundaries and tags each run with its codes", () => {
    const d = parseQCode(DOC);
    const segs = segmentsFor(d, "i1");
    // reconstruct the original text from the segments (no loss)
    expect(segs.map((s) => s.text).join("")).toBe("I trust the doctor but fear the cost.");
    const coded = segs.filter((s) => s.codes.length > 0);
    expect(coded.map((s) => s.text)).toEqual(["trust the doctor", "fear the cost"]);
  });

  it("keeps every code on an overlapping region", () => {
    const d = parseQCode(
      JSON.stringify({
        sources: [{ id: "s", text: "abcdefgh" }],
        codes: [{ name: "x" }, { name: "y" }],
        annotations: [
          { source: "s", code: "x", start: 0, end: 5 },
          { source: "s", code: "y", start: 3, end: 8 },
        ],
      }),
    );
    const segs = segmentsFor(d, "s");
    const overlap = segs.find((s) => s.text === "de");
    expect(overlap?.codes.sort()).toEqual(["x", "y"]);
  });
});

const MIXED = JSON.stringify({
  sources: [{ id: "i1", title: "Interview 1", text: "I trust the doctor but fear the cost." }],
  codes: [{ name: "trust", color: "#123456" }, { name: "fear" }],
  annotations: [
    { source: "i1", code: "trust", start: 2, end: 18, status: "adopted" },
    { source: "i1", code: "fear", start: 23, end: 36, status: "candidate" },
  ],
});

describe("candidatesOf", () => {
  it("returns only candidate annotations with their original index", () => {
    const p = parseQCode(MIXED);
    const doc = { sources: p.sources, codes: p.codes, annotations: p.annotations };
    const c = candidatesOf(doc);
    expect(c).toHaveLength(1);
    expect(c[0].annotation.code).toBe("fear");
    expect(c[0].index).toBe(1);
  });

  it("treats a missing status as adopted (legacy files have no candidates)", () => {
    const p = parseQCode(DOC);
    const doc = { sources: p.sources, codes: p.codes, annotations: p.annotations };
    expect(candidatesOf(doc)).toHaveLength(0);
  });

  it("drops candidates whose span is out of range or points at an unknown source", () => {
    const doc = {
      sources: [{ id: "i1", text: "I trust the doctor but fear the cost." }],
      codes: [{ name: "fear" }, { name: "trust" }, { name: "ghost" }],
      annotations: [
        { source: "i1", code: "fear", start: 23, end: 36, status: "candidate" as const }, // valid
        { source: "i1", code: "trust", start: 2, end: 999, status: "candidate" as const }, // out of range
        { source: "nope", code: "ghost", start: 0, end: 3, status: "candidate" as const }, // unknown source
      ],
    };
    const c = candidatesOf(doc);
    expect(c).toHaveLength(1);
    expect(c[0].annotation.code).toBe("fear");
    expect(c[0].index).toBe(0);
  });
});

describe("codeColor", () => {
  it("uses an explicit color when the code declares one", () => {
    const p = parseQCode(MIXED);
    const doc = { sources: p.sources, codes: p.codes, annotations: p.annotations };
    expect(codeColor(doc, "trust")).toBe("#123456");
  });

  it("falls back to a series variable by code index", () => {
    const p = parseQCode(MIXED);
    const doc = { sources: p.sources, codes: p.codes, annotations: p.annotations };
    expect(codeColor(doc, "fear")).toBe("var(--series-2)");
  });
});

const docFrom = (json: string) => {
  const p = parseQCode(json);
  return { sources: p.sources, codes: p.codes, annotations: p.annotations };
};

describe("adoptAnnotation", () => {
  it("flips one annotation to adopted + human_adopted without mutating the input", () => {
    const doc = docFrom(MIXED);
    const next = adoptAnnotation(doc, 1);
    expect(next.annotations[1].status).toBe("adopted");
    expect(next.annotations[1].provenance).toBe("human_adopted");
    expect(doc.annotations[1].status).toBe("candidate");
    expect(next.annotations[0]).toEqual(doc.annotations[0]);
  });
});

describe("rejectAnnotation", () => {
  it("removes the annotation at the index without mutating the input", () => {
    const doc = docFrom(MIXED);
    const next = rejectAnnotation(doc, 1);
    expect(next.annotations).toHaveLength(1);
    expect(next.annotations[0].code).toBe("trust");
    expect(doc.annotations).toHaveLength(2);
  });
});

describe("workbenchSegments", () => {
  it("tags each coded run with the covering codes and their status", () => {
    const doc = docFrom(MIXED);
    const segs = workbenchSegments(doc, "i1");
    expect(segs.map((s) => s.text).join("")).toBe("I trust the doctor but fear the cost.");
    const trust = segs.find((s) => s.text === "trust the doctor");
    const fear = segs.find((s) => s.text === "fear the cost");
    expect(trust?.codes).toEqual([{ name: "trust", status: "adopted" }]);
    expect(fear?.codes).toEqual([{ name: "fear", status: "candidate" }]);
  });

  it("defaults a status-less annotation to adopted", () => {
    const doc = docFrom(DOC);
    const segs = workbenchSegments(doc, "i1");
    const coded = segs.filter((s) => s.codes.length > 0);
    expect(coded.every((s) => s.codes.every((c) => c.status === "adopted"))).toBe(true);
  });
});

describe("quoteOf", () => {
  it("slices the exact quote from the source (never invents text)", () => {
    const doc = docFrom(MIXED);
    expect(quoteOf(doc, doc.annotations[1])).toBe("fear the cost");
  });
});

describe("serializeQCode", () => {
  it("round-trips a doc back to parseable JSON preserving status", () => {
    const doc = adoptAnnotation(docFrom(MIXED), 1);
    const json = serializeQCode(doc);
    const reparsed = parseQCode(json);
    expect(reparsed.annotations[1].status).toBe("adopted");
    expect(reparsed.annotations[1].provenance).toBe("human_adopted");
    expect(reparsed.warnings).toEqual([]);
  });
});

describe("exports (codebook + excerpts CSV)", () => {
  // A doc mixing an adopted, a candidate (pending), and a plain (legacy=adopted)
  // annotation, plus a quote containing a comma so CSV escaping is exercised.
  const D = JSON.stringify({
    sources: [{ id: "i1", text: "I trust the doctor, but fear the cost." }],
    codes: [
      { name: "trust", description: "belief in the clinician" },
      { name: "fear", description: "worry, esp. financial" },
      { name: "unused" },
    ],
    annotations: [
      { source: "i1", code: "trust", start: 2, end: 18, status: "adopted" }, // "trust the doctor"
      { source: "i1", code: "fear", start: 24, end: 37 }, // legacy → adopted; "fear the cost"
      { source: "i1", code: "trust", start: 0, end: 1, status: "candidate" }, // pending → excluded
    ],
  });

  it("adoptedAnnotations keeps adopted + legacy, drops candidates", () => {
    const doc = parseQCode(D);
    const kept = adoptedAnnotations(doc);
    expect(kept).toHaveLength(2);
    expect(kept.every((a) => (a.status ?? "adopted") === "adopted")).toBe(true);
  });

  it("codebookCsv lists every code with its adopted count (0 for unused)", () => {
    const rows = codebookCsv(parseQCode(D)).trim().split("\n");
    expect(rows[0]).toBe("code,description,count");
    expect(rows).toContain('trust,belief in the clinician,1');
    expect(rows).toContain('fear,"worry, esp. financial",1'); // comma → quoted
    expect(rows).toContain("unused,,0");
  });

  it("excerptsCsv carries verbatim quotes for adopted annotations only", () => {
    const csv = excerptsCsv(parseQCode(D));
    const rows = csv.trim().split("\n");
    expect(rows[0]).toBe("source,code,start,end,quote,memo");
    expect(rows).toHaveLength(3); // header + 2 adopted (candidate excluded)
    expect(csv).toContain("trust the doctor");
    expect(csv).toContain("fear the cost");
  });
});
