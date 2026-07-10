import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { QCodeDoc } from "@/lib/qcode";
import { SourcePane } from "./SourcePane";

const doc: QCodeDoc = {
  sources: [{ id: "i1", title: "Interview 1", text: "I trust the doctor but fear the cost." }],
  codes: [{ name: "trust" }, { name: "fear" }],
  annotations: [
    { source: "i1", code: "trust", start: 2, end: 18, status: "adopted" },
    { source: "i1", code: "fear", start: 23, end: 36, status: "candidate" },
  ],
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

describe("SourcePane", () => {
  it("renders adopted spans solid and candidate spans dashed", () => {
    const { container } = render(<SourcePane doc={doc} active={null} focused={null} />);
    const adopted = container.querySelector('mark[data-status="adopted"]');
    const candidate = container.querySelector('mark[data-status="candidate"]');
    expect(adopted?.textContent).toBe("trust the doctor");
    expect(candidate?.textContent).toBe("fear the cost");
  });

  it("marks the focused annotation's span for emphasis", () => {
    const { container } = render(<SourcePane doc={doc} active={null} focused={1} />);
    const focused = container.querySelector("mark.ring-2");
    expect(focused?.textContent).toBe("fear the cost");
  });
});
