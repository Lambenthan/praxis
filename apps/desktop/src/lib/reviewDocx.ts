// Export a compiled review (the PdfDoc facsimile shown in the PDF inspector)
// as a journal-formatted .docx — the Word twin of the on-screen paper. Same
// approach as the .qreg table export: a minimal OOXML package written by hand
// and zipped, no heavy docx library. Chinese content gets a Chinese-journal
// look (SimSun body, SimHei headings, 1.5 line spacing); otherwise APA-ish
// (Times New Roman, double-spaced). This is the client-side path for the demo;
// a real agent run compiles Word through the journal-docx skill.
import type { PdfDoc } from "@ai4s/shared";

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const hasCJK = (s: string): boolean => /[㐀-鿿]/.test(s);

interface Fonts {
  ascii: string;
  cjk: string;
  cjkHead: string;
  line: number; // twentieths of a point, w:line auto
}

/** One OOXML run with font + optional bold/italic/superscript; size in half-pt. */
function run(
  text: string,
  f: Fonts,
  o: { bold?: boolean; italic?: boolean; sup?: boolean; sz?: number; head?: boolean } = {},
): string {
  const cjk = o.head ? f.cjkHead : f.cjk;
  const rpr =
    `<w:rFonts w:ascii="${f.ascii}" w:hAnsi="${f.ascii}" w:eastAsia="${cjk}" w:cs="${f.ascii}"/>` +
    (o.bold ? "<w:b/>" : "") +
    (o.italic ? "<w:i/>" : "") +
    (o.sup ? '<w:vertAlign w:val="superscript"/>' : "") +
    `<w:sz w:val="${o.sz ?? 24}"/>`;
  return `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function para(
  runs: string,
  f: Fonts,
  o: { align?: "left" | "center" | "both"; before?: number; after?: number; indentChars?: number } = {},
): string {
  const jc = o.align ? `<w:jc w:val="${o.align}"/>` : "";
  const ind = o.indentChars ? `<w:ind w:firstLineChars="${o.indentChars * 100}" w:firstLine="480"/>` : "";
  const sp = `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 120}" w:line="${f.line}" w:lineRule="auto"/>`;
  return `<w:p><w:pPr>${jc}${sp}${ind}</w:pPr>${runs}</w:p>`;
}

/** The summary table as a bordered three-line Word table. */
function table(cols: string[], rows: string[][], f: Fonts): string {
  const width = 9360;
  const colW = Math.round(width / Math.max(1, cols.length));
  const side = (s: string, on: boolean) =>
    on ? `<w:${s} w:val="single" w:sz="8" w:space="0" w:color="auto"/>` : "";
  const cell = (runs: string, edge: { top?: boolean; bottom?: boolean }) =>
    `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/><w:tcBorders>${side("top", !!edge.top)}${side("bottom", !!edge.bottom)}</w:tcBorders><w:vAlign w:val="center"/></w:tcPr>` +
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${runs}</w:p></w:tc>`;
  const tr = (cells: string[], edge: { top?: boolean; bottom?: boolean }) =>
    `<w:tr>${cells.map((c) => cell(c, edge)).join("")}</w:tr>`;
  const head = tr(cols.map((c) => run(c, f, { bold: true, sz: 20, head: true })), { top: true, bottom: true });
  const body = rows.map((r, i) =>
    tr(r.map((c) => run(c, f, { sz: 20 })), { bottom: i === rows.length - 1 }),
  );
  const grid = `<w:tblGrid>${cols.map(() => `<w:gridCol w:w="${colW}"/>`).join("")}</w:tblGrid>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/></w:tblPr>` +
    grid +
    head +
    body.join("") +
    `</w:tbl>`
  );
}

/** The <w:body> XML for a review PdfDoc — pure and testable, no zip. */
export function reviewDocumentXml(doc: PdfDoc): string {
  const sampled = doc.title + " " + doc.sections.map((s) => s.body).join(" ");
  const cjk = hasCJK(sampled);
  const f: Fonts = cjk
    ? { ascii: "Times New Roman", cjk: "SimSun", cjkHead: "SimHei", line: 360 } // 1.5×
    : { ascii: "Times New Roman", cjk: "Times New Roman", cjkHead: "Times New Roman", line: 480 }; // double
  const indentChars = cjk ? 2 : 0;

  const parts: string[] = [];
  parts.push(para(run(doc.title, f, { bold: true, sz: 32, head: true }), f, { align: "center", after: 40 }));
  if (doc.subtitle)
    parts.push(para(run(doc.subtitle, f, { italic: true, sz: 24 }), f, { align: "center", after: 160 }));

  if (doc.summaryTable)
    parts.push(table(doc.summaryTable.columns, doc.summaryTable.rows, f), para("", f, { after: 60 }));

  // Figures are SVG placeholders on screen; in Word we carry the caption (the
  // scientific content) rather than embedding a raster — the agent path emits
  // real image files.
  if (doc.figure)
    parts.push(
      para(
        run(`${doc.figure.title}. `, f, { bold: true, italic: true, sz: 20, head: true }) +
          run(doc.figure.caption ?? "", f, { italic: true, sz: 20 }),
        f,
        { align: "center", after: 160 },
      ),
    );

  for (const s of doc.sections) {
    parts.push(para(run(s.heading, f, { bold: true, sz: 26, head: true }), f, { before: 160, after: 60 }));
    for (const block of s.body.split(/\n\n+/)) {
      const b = block.trim();
      if (b) parts.push(para(run(b, f, { sz: 24 }), f, { align: "both", indentChars }));
    }
  }

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    parts.join("") +
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`
  );
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

/** Zip the review into a real .docx byte array (JSZip, lazy-loaded). */
export async function reviewDocx(doc: PdfDoc): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/document.xml", reviewDocumentXml(doc));
  return zip.generateAsync({ type: "uint8array" });
}
