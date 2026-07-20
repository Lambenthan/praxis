import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach } from "vitest";
import { useUiStore } from "@/lib/store";
import { renderAt } from "@/test/render";

const base = "/example";

// The examples are real transcripts plus REAL artifact files (installed under
// <base>/examples/<run>) — so every inspector here is the same file-preview a
// live session uses, never a hand-built facsimile.
describe("SessionPage", () => {
  beforeEach(() => useUiStore.setState({ inspectorOpen: true }));

  it("literature session: full transcript + the real PDF as the default inspector", () => {
    renderAt(`${base}/lit-review`);
    expect(screen.getAllByText("耐心资本与企业长期投资实证文献梳理").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/耐心资本和企业长期投资/).length).toBeGreaterThan(0); // 用户原话在完整转录里
    const inspector = document.querySelector('[data-variant="file"]');
    expect(inspector).toBeInTheDocument();
    expect(screen.getAllByText(/patient_capital_review\.pdf/).length).toBeGreaterThan(0);
    // The real Word deliverable is present in the thread as a clickable card.
    expect(screen.getAllByText(/patient_capital_review_journal\.docx/).length).toBeGreaterThan(0);
  });

  it("regression session: transcript + the real results.qreg as the default inspector", () => {
    renderAt(`${base}/scvi-sweep`);
    expect(screen.getAllByText("nlsw88工资影响因素稳健性检验").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/多试几个设定/).length).toBeGreaterThan(0); // 用户原话在完整转录里
    expect(document.querySelector('[data-variant="file"]')).toBeInTheDocument();
    expect(screen.getAllByText(/results\.qreg/).length).toBeGreaterThan(0);
  });

  it("clicking a deliverable card redirects it to the bundled real file (base root)", async () => {
    renderAt(`${base}/figure-canvas`);
    expect(document.querySelector('[data-variant="file"]')).toBeInTheDocument();
    const card = screen.getAllByText("plot_eduwage.py")[0]!;
    await userEvent.click(card);
    // The inspector now targets the materialized copy under examples/figure.
    expect(screen.getAllByText(/plot_eduwage\.py/).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-variant="file"]')).toBeInTheDocument();
  });

  it("shows a not-found state for an unknown session", () => {
    renderAt(`${base}/nope`);
    expect(screen.getByText("Session not found")).toBeInTheDocument();
  });
});
