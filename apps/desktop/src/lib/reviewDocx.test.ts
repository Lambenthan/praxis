import { describe, expect, it } from "vitest";
import type { PdfDoc } from "@ai4s/shared";
import { reviewDocumentXml } from "./reviewDocx";

const enDoc: PdfDoc = {
  title: "Patient Capital and Corporate Long-Term Investment",
  subtitle: "ownership horizons, monitoring, and the returns to patience",
  summaryTable: {
    kind: "table",
    columns: ["Papers", "Years", "Top-cited"],
    rows: [["31", "1998–2024", "Bushee 1998"]],
  },
  figure: { kind: "figure", title: "Figure 1", src: "data:x", caption: "citation scatter" },
  sections: [
    { heading: "1  Problem statement", body: "Para one.\n\nPara two." },
    { heading: "2  Measures", body: "Bushee (1998) classifies institutions." },
  ],
};

const zhDoc: PdfDoc = {
  title: "耐心资本与企业长期投资",
  sections: [{ heading: "1 引言", body: "企业是否为长期投资,取决于谁持有它。" }],
};

describe("reviewDocumentXml", () => {
  it("produces a well-formed OOXML body with the title, table, and sections", () => {
    const xml = reviewDocumentXml(enDoc);
    expect(xml).toContain("<w:document");
    expect(xml).toContain("</w:document>");
    expect(xml).toContain("Patient Capital and Corporate Long-Term Investment");
    expect(xml).toContain("<w:tbl>"); // summary table rendered as a Word table
    expect(xml).toContain("Bushee 1998");
    expect(xml).toContain("1  Problem statement");
    expect(xml).toContain("citation scatter"); // figure caption carried over
    // Both body paragraphs of the split section survive.
    expect(xml).toContain("Para one.");
    expect(xml).toContain("Para two.");
  });

  it("uses the English (APA) style — Times New Roman, double spacing — for Latin text", () => {
    const xml = reviewDocumentXml(enDoc);
    expect(xml).toContain('w:eastAsia="Times New Roman"');
    expect(xml).toContain('w:line="480"'); // double
    expect(xml).not.toContain("SimSun");
  });

  it("switches to the Chinese-journal style (SimSun/SimHei, 1.5 spacing) for CJK text", () => {
    const xml = reviewDocumentXml(zhDoc);
    expect(xml).toContain('w:eastAsia="SimSun"'); // body
    expect(xml).toContain('w:eastAsia="SimHei"'); // headings
    expect(xml).toContain('w:line="360"'); // 1.5×
    expect(xml).toContain('w:firstLineChars="200"'); // 首行缩进 2 字符
  });

  it("escapes XML-special characters in content", () => {
    const xml = reviewDocumentXml({ title: "A & B <x>", sections: [] });
    expect(xml).toContain("A &amp; B &lt;x&gt;");
  });
});
