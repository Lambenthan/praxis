import type { Project, Session } from "@ai4s/shared";
import { citationScatter, patientCapitalScatter, wageCoefPlot } from "./figures";

// Three read-only example sessions for the empty-app tour. They mirror the
// three deliverable shapes a quantitative social-science project produces — a
// figure with its script, a specification screen with a live analysis, and a
// literature review compiled to LaTeX/PDF — so a new user sees what the
// workbench makes before running anything of their own.

// ---- Session 1: a figure + the do-file that drew it ----

const figureSession: Session = {
  id: "figure-canvas",
  projectId: "patient-capital",
  title: "Patient capital vs green transition",
  group: "Examples",
  status: "done",
  blocks: [
    {
      kind: "agent",
      markdown:
        "Drew `pc_green_scatter.png` from `analysis_panel.dta` — green-transition investment intensity against patient-capital ownership, firm-year level, with the OLS fit overlaid. Points and the fitted line come straight from the regression in `make_scatter.do`.",
    },
    {
      kind: "figure",
      title: "pc_green_scatter.png",
      src: patientCapitalScatter,
      caption:
        "1,842 firm-years · green-transition investment rises with patient-capital ownership (OLS fit in terracotta)",
      annotations: [{ index: 1, note: "add the 95% CI band here", x: 68, y: 40 }],
    },
  ],
  inspector: {
    variant: "artifact",
    title: "pc_green_scatter.png",
    filename: "make_scatter.do",
    versions: [
      {
        label: "v1",
        reviewPassed: false,
        code: `use "analysis_panel.dta", clear

* v1: raw scatter, no fit line, default Stata styling
twoway scatter green_invest patient_capital, ///
    mcolor(navy%50) msize(small)
graph export "pc_green_scatter.png", replace width(1600)`,
        executionLog:
          '$ stata -b do make_scatter.do\n(1,842 firm-years read)\n[ok] wrote pc_green_scatter.png (v1)  0.9 MB  1600x1080\nfinished in 3.4s',
      },
      { label: "v2", reviewPassed: true },
    ],
    activeVersion: "v2",
    reviewPassed: true,
    inputs: ["analysis_panel.dta", "variable_dictionary.csv"],
    language: "stata",
    codeStartLine: 1,
    code: `use "analysis_panel.dta", clear

* keep the estimation sample and label the axes from the dictionary
keep if !missing(green_invest, patient_capital)
label var green_invest "Green-transition investment (% of capex)"
label var patient_capital "Patient-capital ownership (%)"

* v2: overlay the OLS fit and adopt the house figure style
twoway (scatter green_invest patient_capital, ///
            mcolor("30 42 58 %50") msize(small)) ///
       (lfit green_invest patient_capital, ///
            lcolor("192 106 62") lwidth(medthick)), ///
    legend(off) ///
    ytitle("Green-transition investment (% of capex)") ///
    xtitle("Patient-capital ownership (%)") ///
    graphregion(color(white)) plotregion(color(white))
graph export "pc_green_scatter.png", replace width(1600)`,
    executionLog:
      '$ stata -b do make_scatter.do\n(1,842 firm-years read)\n[ok] slope = 0.46 (se 0.08, p<0.001)\n[ok] wrote pc_green_scatter.png (v2)  1.1 MB  1600x1080\nfinished in 3.9s',
    environment: "Stata 18.0 (MP) · stata-mcp bridge\nworkspace: patient-capital (local)",
    messages: [
      "plot green-transition investment against patient-capital ownership",
      "add the OLS fit line and use the house style",
    ],
  },
};

// ---- Session 2: a specification screen — model menu, coefficient plot, runs ----

const specRows: string[][] = [
  ["1", "Naive OLS", "0.098***", "—", "—", "3,204", "0.11"],
  ["2", "+ controls", "0.087***", "✓", "—", "3,204", "0.29"],
  ["3", "+ industry FE", "0.081***", "✓", "✓", "3,204", "0.34"],
  ["4", "+ industry × year FE", "0.079***", "✓", "✓", "3,190", "0.37"],
];

const sweepSession: Session = {
  id: "scvi-sweep",
  projectId: "patient-capital",
  title: "Wage determinants — specification screen",
  group: "Examples",
  status: "running",
  badge: 4,
  blocks: [
    {
      kind: "agent",
      markdown:
        "Running the four-model menu for `log_wage` on `years_school` (nlsw88): naive OLS → add controls (tenure, age, union) → add industry fixed effects → add industry × year. Each is a separate `regress`/`areg` run; standard errors clustered by industry.",
    },
    {
      kind: "table",
      columns: ["#", "specification", "schooling coef.", "controls", "FE", "N", "R²"],
      rows: specRows,
    },
    {
      kind: "figure",
      title: "schooling_coef_by_spec.png",
      src: wageCoefPlot,
      caption:
        "Return to a year of schooling holds at 0.08–0.10 log points across all four specifications (95% CI whiskers; dashed line at zero)",
    },
    {
      kind: "running-jobs",
      title: "LOCAL · 4",
      jobs: [
        { label: "stata · (1) naive OLS", elapsed: "2.1s" },
        { label: "stata · (2) + controls", elapsed: "2.4s" },
        { label: "stata · (3) + industry FE", elapsed: "3.0s" },
        { label: "stata · (4) + industry × year FE", elapsed: "3.6s" },
      ],
    },
    { kind: "status-line", text: "4 models fitted · assembling results.qreg", tone: "running" },
  ],
  inspector: {
    variant: "notebook",
    name: "wage-panel",
    live: true,
    kernelLabel: "R — wage-panel kernel",
    kernelNote:
      "Connected to the agent's live kernel — the fitted models and data frame are in memory. Type an expression and press Enter.",
    cells: [
      {
        index: 12,
        language: "r",
        code: `library(fixest)
panel <- haven::read_dta("nlsw88.dta")
panel$log_wage <- log(panel$wage)

# the four specifications, clustered by industry
m1 <- feols(log_wage ~ yrs_school, panel)
m2 <- feols(log_wage ~ yrs_school + tenure + age + union, panel)
m3 <- feols(log_wage ~ yrs_school + tenure + age + union | industry, panel)
m4 <- feols(log_wage ~ yrs_school + tenure + age + union | industry^year, panel)

coefs <- sapply(list(m1, m2, m3, m4), \\(m) coef(m)["yrs_school"])
round(coefs, 3)`,
        output: "[1] 0.098 0.087 0.081 0.079",
      },
    ],
  },
};

// ---- Session 3: a literature review compiled to LaTeX + PDF ----

const litSession: Session = {
  id: "lit-review",
  projectId: "patient-capital",
  title: "Patient capital and firm behavior — a review",
  group: "Examples",
  status: "warn",
  blocks: [
    {
      kind: "user",
      text: "Write a literature review on patient capital and corporate long-term investment. Pull the primary empirical papers and recent evidence. Output the report as a LaTeX doc and a compiled PDF.",
    },
    {
      kind: "step-summary",
      summary: "Ran 4 searches, loaded 2 skills, compiled the PDF, +2 more",
      steps: 10,
      details: [
        "systematic-literature-review skill loaded",
        "citation-check skill loaded",
        "OpenAlex / Crossref / SSRN / Google Scholar searches",
        "environment: latex-manuscript (local TinyTeX)",
      ],
    },
    {
      kind: "agent",
      markdown:
        "Dispatching four parallel retrieval tracks — OpenAlex for primary empirical papers and citation counts, Crossref for DOIs, SSRN for recent working papers, and a targeted pass for the ownership-horizon measures used in each study.",
    },
    {
      kind: "tool-call",
      title: "Dispatching OpenAlex Crossref SSRN retrieval sub-agents",
      status: "success",
      meta: "118 lines of output",
    },
    {
      kind: "reviewer",
      note: "The agent reads these findings and self-corrects in its next message.",
      findings: [
        {
          level: "warn",
          title: "Bushee (1998) cited for both a 0.31 and a −0.12 effect on R&D",
          evidence:
            'In the synthesis step the agent writes the transient-institution effect on R&D as "β = 0.31" in the table and "β = −0.12" in the prose of the same paragraph, both attributed to Bushee (1998). The signs disagree, so at least one is wrong — the original reports that transient ownership *raises* the probability of an R&D cut, i.e. a negative effect on R&D. No lookup row traces the 0.31.',
        },
      ],
    },
    {
      kind: "agent",
      markdown:
        "Acknowledged — the 0.31 was pulled from the wrong column. Bushee (1998) reports transient institutional ownership *increasing* the odds of an R&D cut; the corrected table now carries the negative effect and the prose matches.",
    },
    { kind: "status-line", text: "all 4 agents done · Reviewing", tone: "review" },
  ],
  inspector: {
    variant: "pdf",
    title: "review.pdf",
    doc: {
      title: "Patient capital and corporate long-term investment",
      subtitle: "ownership horizons, monitoring, and the returns to patience",
      summaryTable: {
        kind: "table",
        columns: ["Papers", "Years", "Measures", "Outcomes", "Top-cited", "Most recent"],
        rows: [
          ["31", "1998–2024", "7 horizon measures", "R&D · capex · green", "Bushee 1998 (4,120 cit.)", "SSRN WP (2024)"],
        ],
      },
      figure: {
        kind: "figure",
        title: "Figure 1",
        src: citationScatter,
        caption:
          "Thirty-one empirical studies (1998–2024) by publication year and citation count (log scale); larger clusters mark the ownership-horizon literature.",
      },
      sections: [
        {
          heading: "1  Problem statement",
          body: "Whether a firm invests for the long term is thought to depend on who owns it and for how long. Patient capital — ownership with a long holding horizon — is argued to insulate managers from short-term earnings pressure, but the empirical horizon measures differ across studies, so effect sizes are not directly comparable.",
        },
        {
          heading: "2  Ownership-horizon measures",
          body: "Bushee (1998) classifies institutions as transient, dedicated, or quasi-indexer from portfolio turnover, and links transient ownership to R&D cuts after earnings disappointments. Later work replaces the churn classification with holding-duration and blockholder-tenure measures; the disagreement in estimated effects tracks these measurement choices as much as the underlying samples.",
        },
      ],
    },
  },
};

export const mockProject: Project = {
  id: "patient-capital",
  name: "Patient capital & firm behavior",
  sessions: [figureSession, sweepSession, litSession],
};

export const mockProjects: Project[] = [mockProject];

export function findSession(sessionId: string): Session | undefined {
  return mockProject.sessions.find((s) => s.id === sessionId);
}

export const defaultSessionId = litSession.id;
