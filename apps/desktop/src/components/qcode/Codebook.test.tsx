import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QCodeDoc } from "@/lib/qcode";
import { Codebook } from "./Codebook";

const doc: QCodeDoc = {
  sources: [{ id: "i1", text: "I trust the doctor but fear the cost." }],
  codes: [{ name: "trust" }, { name: "fear" }],
  annotations: [
    { source: "i1", code: "trust", start: 2, end: 18, status: "adopted" },
    { source: "i1", code: "fear", start: 23, end: 36, status: "candidate" },
  ],
};

describe("Codebook", () => {
  it("lists codes with their annotation counts", () => {
    render(<Codebook doc={doc} active={null} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /trust/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /fear/ })).toHaveTextContent("1");
  });

  it("toggles a code on click", async () => {
    const onToggle = vi.fn();
    render(<Codebook doc={doc} active={null} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: /trust/ }));
    expect(onToggle).toHaveBeenCalledWith("trust");
  });
});
