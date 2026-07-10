import { describe, expect, it } from "vitest";
import {
  adoptModel,
  coefFor,
  doFile,
  fmtNum,
  latexTable,
  modelStatus,
  parseQReg,
  rejectModel,
  docxDocumentXml,
  docxTable,
  serializeQReg,
  shortModelName,
  stars,
  tableModels,
  varOrder,
} from "./qreg";

const doc = parseQReg(
  JSON.stringify({
    title: "Price determinants",
    depvar: "price",
    models: [
      {
        name: "(1) OLS",
        cmd: "regress price mpg weight",
        n: 74,
        r2: 0.2934,
        coefs: [
          { var: "mpg", b: -49.512, se: 86.156, p: 0.567 },
          { var: "weight", b: 1.747, se: 0.641, p: 0.008 },
          { var: "_cons", b: 1946.069, se: 3597.05, p: 0.59 },
        ],
        status: "candidate",
      },
      {
        name: "(2) FE",
        cmd: "areg price mpg weight, absorb(rep78) vce(cluster rep78)",
        n: 69,
        r2: 0.3684,
        coefs: [
          { var: "mpg", b: -57.3, se: 40.2, p: 0.21 },
          { var: "weight", b: 1.6, se: 0.5, p: 0.03 },
          { var: "foreign", b: 2500, se: 800, p: 0.004 },
          { var: "_cons", b: 2000, se: 3000, p: 0.52 },
        ],
        status: "candidate",
      },
    ],
  }),
);

describe("parseQReg", () => {
  it("round-trips a valid document", () => {
    expect(doc.depvar).toBe("price");
    expect(doc.models).toHaveLength(2);
    expect(parseQReg(serializeQReg(doc)).models[1].coefs).toHaveLength(4);
  });

  it("rejects non-JSON, empty models, and non-numeric coefficients", () => {
    expect(() => parseQReg("<xml/>")).toThrow(/not valid JSON/);
    expect(() => parseQReg('{"models":[]}')).toThrow(/no models/);
    expect(() =>
      parseQReg(
        '{"models":[{"name":"m","cmd":"c","n":10,"coefs":[{"var":"x","b":"NaN?","se":1,"p":0.5}]}]}',
      ),
    ).toThrow(/non-numeric/);
  });
});

describe("adjudication", () => {
  it("adopt flips status; reject removes the model", () => {
    const adopted = adoptModel(doc, 0);
    expect(modelStatus(adopted.models[0])).toBe("adopted");
    expect(modelStatus(adopted.models[1])).toBe("candidate");
    const rejected = rejectModel(doc, 0);
    expect(rejected.models).toHaveLength(1);
    expect(rejected.models[0].name).toBe("(2) FE");
  });

  it("a model without status counts as adopted (hand-built final tables)", () => {
    expect(modelStatus({ ...doc.models[0], status: undefined })).toBe("adopted");
  });
});

describe("table helpers", () => {
  it("stars follow the econ convention", () => {
    expect(stars(0.005)).toBe("***");
    expect(stars(0.03)).toBe("**");
    expect(stars(0.07)).toBe("*");
    expect(stars(0.2)).toBe("");
  });

  it("formats numbers by magnitude", () => {
    expect(fmtNum(1946.069)).toBe("1946");
    expect(fmtNum(-49.512)).toBe("-49.51");
    expect(fmtNum(1.747)).toBe("1.747");
  });

  it("orders variables by first appearance with the constant last", () => {
    expect(varOrder(doc)).toEqual(["mpg", "weight", "foreign", "_cons"]);
  });

  it("returns null for a variable a model does not include", () => {
    expect(coefFor(doc.models[0], "foreign")).toBeNull();
    expect(coefFor(doc.models[1], "foreign")?.b).toBe(2500);
  });

  it("shortens a colon-qualified model name to its head", () => {
    expect(shortModelName("(1) 简约基准: mpg + weight")).toBe("(1) 简约基准");
    expect(shortModelName("(2) OLS")).toBe("(2) OLS");
  });

  it("exports the adopted models, or all when none is adopted", () => {
    expect(tableModels(doc)).toHaveLength(2); // both candidates → all
    const one = adoptModel(doc, 1);
    expect(tableModels(one)).toHaveLength(1);
    expect(tableModels(one)[0].name).toBe("(2) FE");
  });

  it("renders a booktabs three-line LaTeX table", () => {
    const tex = latexTable(doc);
    expect(tex).toContain("\\toprule");
    expect(tex).toContain("\\midrule");
    expect(tex).toContain("\\bottomrule");
    expect(tex).toContain("\\begin{tabular}{l*{2}{c}}");
    // coefficient with stars, SE beneath, constant relabeled, underscores escaped
    expect(tex).toContain("1.747$^{***}$");
    expect(tex).toContain("(0.641)");
    expect(tex).toContain("Constant");
    expect(tex).toContain("$R^2$");
    expect(tex).toContain("Dependent variable: price.");
  });

  it("renders the Word .docx body as a bordered three-line table", () => {
    const xml = docxDocumentXml(doc);
    expect(xml).toContain("<w:tbl>"); // a real Word table
    expect(xml).toContain("<w:tcBorders>"); // horizontal rules
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>'); // stars / R²
    expect(xml).toContain(">1.747<"); // coefficient text
    expect(xml).toContain(">(0.641)<"); // SE beneath
    expect(xml).toContain("Dependent variable: price.");
    // XML-escapes content rather than corrupting the package
    expect(docxDocumentXml({ ...doc, title: "A & B" })).toContain("A &amp; B");
  });

  it("packages a valid .docx zip (openable by Word)", async () => {
    const bytes = await docxTable(doc);
    // ZIP local-file-header magic "PK\x03\x04"
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes.length).toBeGreaterThan(400);
  });

  it("reconstructs a runnable do-file from the model commands", () => {
    const d = doFile(doc, "auto.qreg");
    expect(d).toContain("regress price mpg weight");
    expect(d).toContain("areg price mpg weight, absorb(rep78) vce(cluster rep78)");
    expect(d).toContain("* (1) OLS");
    expect(d).toContain("use \"yourdata.dta\", clear");
  });
});
