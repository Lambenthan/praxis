import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { QCodeWorkbench } from "./QCodeWorkbench";

const TEXT = JSON.stringify({
  sources: [{ id: "i1", title: "Interview 1", text: "I trust the doctor but fear the cost." }],
  codes: [{ name: "trust" }, { name: "fear" }],
  annotations: [
    { source: "i1", code: "trust", start: 2, end: 18, status: "adopted" },
    { source: "i1", code: "fear", start: 23, end: 36, status: "candidate" },
  ],
});

// A different file: distinct source text, codes, and a distinct candidate quote.
const OTHER = JSON.stringify({
  sources: [{ id: "i2", title: "Interview 2", text: "She values privacy over convenience." }],
  codes: [{ name: "privacy" }],
  annotations: [{ source: "i2", code: "privacy", start: 11, end: 18, status: "candidate" }],
});

// Two candidates on the same source, so reject can target one while another is focused.
const TWO = JSON.stringify({
  sources: [{ id: "i1", title: "Interview 1", text: "I trust the doctor but fear the cost." }],
  codes: [{ name: "trust" }, { name: "fear" }],
  annotations: [
    { source: "i1", code: "trust", start: 2, end: 18, status: "candidate" },
    { source: "i1", code: "fear", start: 23, end: 36, status: "candidate" },
  ],
});

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

describe("QCodeWorkbench", () => {
  it("adopting a candidate empties the queue and turns its span solid", async () => {
    const { container } = render(<QCodeWorkbench filename="demo.qcode" text={TEXT} />);
    expect(container.querySelector('mark[data-status="candidate"]')?.textContent).toBe("fear the cost");
    await userEvent.click(screen.getByRole("button", { name: /Adopt/ }));
    expect(screen.getByText(/All candidates adjudicated/)).toBeInTheDocument();
    expect(container.querySelector('mark[data-status="candidate"]')).toBeNull();
    const marks = Array.from(container.querySelectorAll('mark[data-status="adopted"]')).map((m) => m.textContent);
    expect(marks).toContain("fear the cost");
  });

  it("Save serializes the current doc through onSave", async () => {
    const onSave = vi.fn();
    render(<QCodeWorkbench filename="demo.qcode" text={TEXT} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: /Adopt/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(onSave.mock.calls[0][0]);
    expect(saved.annotations[1].status).toBe("adopted");
  });

  it("resyncs when the text prop changes to a different file", () => {
    const { container, rerender } = render(<QCodeWorkbench filename="a.qcode" text={TEXT} />);
    expect(container.querySelector('mark[data-status="candidate"]')?.textContent).toBe(
      "fear the cost",
    );
    rerender(<QCodeWorkbench filename="b.qcode" text={OTHER} />);
    // the old file's content is gone; the new file's candidate is shown
    expect(screen.queryByText(/fear the cost/)).not.toBeInTheDocument();
    expect(container.querySelector('mark[data-status="candidate"]')?.textContent).toBe("privacy");
  });

  it("rejects one candidate while another is focused without a stale index", async () => {
    const { container } = render(<QCodeWorkbench filename="two.qcode" text={TWO} />);
    // focus the later candidate (index 1) — the index most at risk of going stale
    await userEvent.click(screen.getByText("“fear the cost”"));
    // reject the first candidate (index 0), shifting the array under the focus
    const rejectButtons = screen.getAllByRole("button", { name: /Reject/ });
    await userEvent.click(rejectButtons[0]);
    // rejected card is gone, the other remains, nothing threw
    expect(screen.queryByText("“trust the doctor”")).not.toBeInTheDocument();
    expect(screen.getByText("“fear the cost”")).toBeInTheDocument();
    const candidateMarks = Array.from(
      container.querySelectorAll('mark[data-status="candidate"]'),
    ).map((m) => m.textContent);
    expect(candidateMarks).toContain("fear the cost");
    expect(candidateMarks).not.toContain("trust the doctor");
  });
});
