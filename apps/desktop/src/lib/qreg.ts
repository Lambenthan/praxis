// .qreg — regression results awaiting adjudication (the quantitative twin of
// .qcode). A Stata do-file dumps each model as machine-written JSON (built-in
// `file write`, no packages), a script assembles them into one .qreg, and the
// human decides in the workbench which models make the final table. Same
// constitution as coding: AI proposes candidates, the human adopts, every
// number traces back to a do-file run.

export type ModelStatus = "candidate" | "adopted";

export interface QRegCoef {
  /** Stata variable name as estimated, e.g. "mpg", "1.foreign", "_cons". */
  var: string;
  b: number;
  se: number;
  p: number;
}

export interface QRegModel {
  /** Column header, e.g. "(1) OLS", "(3) FE". */
  name: string;
  /** The exact Stata command line that produced it (provenance). */
  cmd: string;
  n: number;
  /** R² when the estimator reports one. */
  r2?: number | null;
  coefs: QRegCoef[];
  /** Missing status means adopted (a hand-built final table loads clean). */
  status?: ModelStatus;
  provenance?: { do?: string; log?: string };
}

export interface QRegDoc {
  title?: string;
  /** Dependent variable, shown in the table header. */
  depvar?: string;
  models: QRegModel[];
}

/** Parse + validate .qreg text. Throws with a specific reason on bad input. */
export function parseQReg(text: string): QRegDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("not valid JSON");
  }
  const doc = raw as QRegDoc;
  if (!Array.isArray(doc.models) || doc.models.length === 0)
    throw new Error("no models array");
  for (const m of doc.models) {
    if (typeof m.name !== "string" || !m.name) throw new Error("model missing name");
    if (typeof m.cmd !== "string") throw new Error(`model ${m.name}: missing cmd`);
    if (typeof m.n !== "number") throw new Error(`model ${m.name}: missing n`);
    if (!Array.isArray(m.coefs) || m.coefs.length === 0)
      throw new Error(`model ${m.name}: no coefs`);
    for (const c of m.coefs) {
      if (typeof c.var !== "string" || !c.var)
        throw new Error(`model ${m.name}: coef missing var`);
      if (![c.b, c.se, c.p].every((x) => typeof x === "number" && Number.isFinite(x)))
        throw new Error(`model ${m.name}: ${c.var} has non-numeric b/se/p`);
    }
  }
  return { title: doc.title, depvar: doc.depvar, models: doc.models };
}

export function serializeQReg(doc: QRegDoc): string {
  return JSON.stringify(doc, null, 2) + "\n";
}

export function modelStatus(m: QRegModel): ModelStatus {
  return m.status ?? "adopted";
}

/** Adopt the model at `index` into the final table. */
export function adoptModel(doc: QRegDoc, index: number): QRegDoc {
  return {
    ...doc,
    models: doc.models.map((m, i) => (i === index ? { ...m, status: "adopted" } : m)),
  };
}

/** Reject the model at `index` — it leaves the document entirely. */
export function rejectModel(doc: QRegDoc, index: number): QRegDoc {
  return { ...doc, models: doc.models.filter((_, i) => i !== index) };
}

/** Coerce whatever the model wrote — number, numeric string, "1,234", null —
 *  into a real number, or null when it truly isn't one. The .qreg is
 *  model-authored, so a coefficient can arrive as "1.747" or even "1,747";
 *  every consumer normalises through this so the table always formats the
 *  same regardless of how the value was serialised. */
export function num(x: unknown): number | null {
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string") {
    const v = Number(x.replace(/,/g, "").trim());
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/** Significance stars, economics convention: * p<0.1, ** p<0.05, *** p<0.01.
 *  A missing or non-numeric p simply yields no stars. */
export function stars(p: unknown): string {
  const v = num(p);
  if (v === null) return "";
  if (v < 0.01) return "***";
  if (v < 0.05) return "**";
  if (v < 0.1) return "*";
  return "";
}

/** Table number format: wide numbers lose decimals, small ones keep precision.
 *  Dirty input (string, null, NaN) renders as an em dash, never "NaN". */
export function fmtNum(x: unknown): string {
  const v = num(x);
  if (v === null) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

/** Row order for the combined table: union of variables across models in
 *  first-appearance order, with the constant always last. */
export function varOrder(doc: QRegDoc): string[] {
  return varOrderOf(doc.models);
}

function varOrderOf(models: QRegModel[]): string[] {
  const seen: string[] = [];
  for (const m of models)
    for (const c of m.coefs) if (!seen.includes(c.var)) seen.push(c.var);
  const cons = seen.filter((v) => v === "_cons");
  return [...seen.filter((v) => v !== "_cons"), ...cons];
}

/** The coefficient a model reports for `v`, or null (variable not in model). */
export function coefFor(m: QRegModel, v: string): QRegCoef | null {
  return m.coefs.find((c) => c.var === v) ?? null;
}

/** The short column label — "(1) 简约基准: mpg + weight" → "(1) 简约基准". */
export function shortModelName(name: string): string {
  const i = name.indexOf(":");
  return i >= 0 ? name.slice(0, i).trim() : name;
}

/** The models that make an exported table: the adopted set, or all of them when
 *  none has been adopted yet (so export still works mid-exploration). */
export function tableModels(doc: QRegDoc): QRegModel[] {
  const adopted = doc.models.filter((m) => modelStatus(m) === "adopted");
  return adopted.length ? adopted : doc.models;
}

const texEscape = (s: string): string => s.replace(/([&%#_$])/g, "\\$1");

/**
 * A booktabs three-line regression table (esttab style) of the table's models,
 * ready to \input into a paper: coefficient with significance stars, standard
 * error beneath in parentheses, then N and R². Package-free notes line.
 */
export function latexTable(doc: QRegDoc): string {
  const models = tableModels(doc);
  const vars = varOrderOf(models);
  const L: string[] = [];
  L.push("\\begin{table}[htbp]\\centering");
  if (doc.title) L.push(`\\caption{${texEscape(doc.title)}}`);
  L.push("\\label{tab:results}");
  L.push(`\\begin{tabular}{l*{${models.length}}{c}}`);
  L.push("\\toprule");
  L.push(` & ${models.map((m) => texEscape(shortModelName(m.name))).join(" & ")} \\\\`);
  L.push("\\midrule");
  for (const v of vars) {
    const label = texEscape(v === "_cons" ? "Constant" : v);
    const bRow = models.map((m) => {
      const c = coefFor(m, v);
      if (!c) return "";
      const st = stars(c.p);
      return `${fmtNum(c.b)}${st ? `$^{${st}}$` : ""}`;
    });
    const seRow = models.map((m) => {
      const c = coefFor(m, v);
      return c ? `(${fmtNum(c.se)})` : "";
    });
    L.push(`${label} & ${bRow.join(" & ")} \\\\`);
    L.push(` & ${seRow.join(" & ")} \\\\`);
  }
  L.push("\\midrule");
  L.push(`$N$ & ${models.map((m) => m.n).join(" & ")} \\\\`);
  if (models.some((m) => m.r2 != null))
    L.push(`$R^2$ & ${models.map((m) => (m.r2 != null ? m.r2.toFixed(3) : "")).join(" & ")} \\\\`);
  L.push("\\bottomrule");
  L.push("\\end{tabular}");
  const note = [
    doc.depvar ? `Dependent variable: ${texEscape(doc.depvar)}.` : "",
    "Standard errors in parentheses.",
    "$^{*}\\,p<0.1$, $^{**}\\,p<0.05$, $^{***}\\,p<0.01$.",
  ]
    .filter(Boolean)
    .join(" ");
  L.push("");
  L.push(`{\\footnotesize ${note}}`);
  L.push("\\end{table}");
  return L.join("\n") + "\n";
}

const xmlEscape = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** One OOXML run: Times New Roman, optional bold / superscript, half-point size. */
function docxRun(text: string, opts: { bold?: boolean; sup?: boolean; sz?: number } = {}): string {
  const rpr =
    `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>` +
    (opts.bold ? "<w:b/>" : "") +
    (opts.sup ? '<w:vertAlign w:val="superscript"/>' : "") +
    `<w:sz w:val="${opts.sz ?? 22}"/>`;
  return `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

/** The <w:body> XML of the three-line table — pure and testable, no zip. */
export function docxDocumentXml(doc: QRegDoc): string {
  const models = tableModels(doc);
  const vars = varOrderOf(models);
  const K = models.length;
  const LABELW = 2600;
  const MODELW = Math.max(900, Math.round((9360 - LABELW) / K));

  const cell = (
    w: number,
    runs: string,
    o: { align: "left" | "center"; top?: boolean; bottom?: boolean },
  ): string => {
    const side = (s: string, on?: boolean) =>
      on ? `<w:${s} w:val="single" w:sz="8" w:space="0" w:color="auto"/>` : "";
    const borders =
      o.top || o.bottom ? `<w:tcBorders>${side("top", o.top)}${side("bottom", o.bottom)}</w:tcBorders>` : "";
    return (
      `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${borders}<w:vAlign w:val="center"/></w:tcPr>` +
      `<w:p><w:pPr><w:jc w:val="${o.align}"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${runs}</w:p></w:tc>`
    );
  };
  const row = (runsPerCell: string[], edge: { top?: boolean; bottom?: boolean } = {}): string =>
    `<w:tr>${runsPerCell
      .map((runs, i) =>
        cell(i === 0 ? LABELW : MODELW, runs, { align: i === 0 ? "left" : "center", ...edge }),
      )
      .join("")}</w:tr>`;

  const rows: string[] = [];
  rows.push(
    row(["", ...models.map((m) => docxRun(shortModelName(m.name)))], { top: true, bottom: true }),
  );
  for (const v of vars) {
    const label = v === "_cons" ? "Constant" : v;
    const bCells = models.map((m) => {
      const c = coefFor(m, v);
      if (!c) return "";
      const st = stars(c.p);
      return docxRun(fmtNum(c.b)) + (st ? docxRun(st, { sup: true }) : "");
    });
    const seCells = models.map((m) => {
      const c = coefFor(m, v);
      return c ? docxRun(`(${fmtNum(c.se)})`) : "";
    });
    rows.push(row([docxRun(label), ...bCells]));
    rows.push(row(["", ...seCells]));
  }
  const hasR2 = models.some((m) => m.r2 != null);
  rows.push(row([docxRun("N"), ...models.map((m) => docxRun(String(m.n)))], { top: true, bottom: !hasR2 }));
  if (hasR2)
    rows.push(
      row([docxRun("R") + docxRun("2", { sup: true }), ...models.map((m) => docxRun(m.r2 != null ? m.r2.toFixed(3) : ""))], {
        bottom: true,
      }),
    );

  const grid = `<w:tblGrid>${[LABELW, ...Array(K).fill(MODELW)]
    .map((w) => `<w:gridCol w:w="${w}"/>`)
    .join("")}</w:tblGrid>`;
  const tbl =
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/></w:tblPr>` +
    grid +
    rows.join("") +
    `</w:tbl>`;
  const titleP = doc.title
    ? `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${docxRun(doc.title, { bold: true })}</w:p>`
    : "";
  const note = [
    doc.depvar ? `Dependent variable: ${doc.depvar}.` : "",
    "Standard errors in parentheses. * p<0.1, ** p<0.05, *** p<0.01.",
  ]
    .filter(Boolean)
    .join(" ");
  const noteP = `<w:p><w:pPr><w:spacing w:before="120"/></w:pPr>${docxRun(note, { sz: 18 })}</w:p>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    titleP +
    tbl +
    noteP +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`
  );
}

const DOCX_CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const DOCX_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

/**
 * A real Word .docx of the three-line table — a minimal OOXML package (zip)
 * Word opens as a native, editable bordered table. Bytes, saved via the binary
 * save path (no preview, no heavy docx library — just JSZip + hand-written XML).
 */
export async function docxTable(doc: QRegDoc): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", DOCX_CONTENT_TYPES);
  zip.file("_rels/.rels", DOCX_RELS);
  zip.file("word/document.xml", docxDocumentXml(doc));
  return zip.generateAsync({ type: "uint8array" });
}

/**
 * A runnable do-file that reproduces the table's models in order. A .qreg does
 * not store the data path, so the user sets it at the top before running.
 */
export function doFile(doc: QRegDoc, sourceName = "results.qreg"): string {
  const models = tableModels(doc);
  const L: string[] = [];
  if (doc.title) L.push(`* ${doc.title}`);
  L.push(`* Reproduction do-file — ${models.length} model(s) from ${sourceName}`);
  L.push(`* Load your data first, e.g.:  use "yourdata.dta", clear`);
  L.push("");
  for (const m of models) {
    L.push(`* ${m.name}`);
    L.push(m.cmd);
    L.push("");
  }
  return L.join("\n");
}
