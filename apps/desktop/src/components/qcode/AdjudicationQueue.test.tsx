import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QCodeDoc } from "@/lib/qcode";
import { AdjudicationQueue } from "./AdjudicationQueue";

const doc: QCodeDoc = {
  sources: [{ id: "i1", text: "I trust the doctor but fear the cost." }],
  codes: [{ name: "trust" }, { name: "fear" }],
  annotations: [
    { source: "i1", code: "trust", start: 2, end: 18, status: "adopted" },
    { source: "i1", code: "fear", start: 23, end: 36, status: "candidate" },
  ],
};

describe("AdjudicationQueue", () => {
  it("shows one card per candidate with its exact quote", () => {
    render(<AdjudicationQueue doc={doc} focused={null} onFocus={() => {}} onAdopt={() => {}} onReject={() => {}} />);
    expect(screen.getByText("“fear the cost”")).toBeInTheDocument();
    expect(screen.queryByText(/trust the doctor/)).not.toBeInTheDocument();
  });

  it("fires onAdopt with the annotation index", async () => {
    const onAdopt = vi.fn();
    render(<AdjudicationQueue doc={doc} focused={null} onFocus={() => {}} onAdopt={onAdopt} onReject={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Adopt/ }));
    expect(onAdopt).toHaveBeenCalledWith(1);
  });

  it("shows an empty state when nothing is pending", () => {
    const clean: QCodeDoc = { ...doc, annotations: [doc.annotations[0]] };
    render(<AdjudicationQueue doc={clean} focused={null} onFocus={() => {}} onAdopt={() => {}} onReject={() => {}} />);
    expect(screen.getByText(/All candidates adjudicated/)).toBeInTheDocument();
  });
});
