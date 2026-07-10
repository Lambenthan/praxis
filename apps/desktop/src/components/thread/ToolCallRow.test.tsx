import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ToolCallStatus } from "@ai4s/shared";
import { ToolCallRow } from "./ToolCallRow";

const STATUSES: [ToolCallStatus, string][] = [
  ["pending", "Pending"],
  ["running", "Running"],
  ["waiting-approval", "Waiting"],
  ["success", "Success"],
  ["warning", "Warning"],
  ["failed", "Failed"],
];

describe("ToolCallRow", () => {
  it.each(STATUSES)("renders the %s status badge", (status, label) => {
    const { container } = render(
      <ToolCallRow block={{ kind: "tool-call", title: "Run tool", status }} />,
    );
    expect(container.querySelector(`[data-status="${status}"]`)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: label })).toBeInTheDocument();
  });

  it("shows the right-aligned meta", () => {
    render(
      <ToolCallRow
        block={{ kind: "tool-call", title: "Dispatch", status: "success", meta: "142 lines of output" }}
      />,
    );
    expect(screen.getByText("142 lines of output")).toBeInTheDocument();
  });

  it("shows the subagent's live activity under a running task row", () => {
    render(
      <ToolCallRow
        block={{ kind: "tool-call", title: "Visual QA for slides", status: "running", childSessionId: "c1" }}
        activity="python3 analyze slide-03.jpg"
      />,
    );
    expect(screen.getByText("python3 analyze slide-03.jpg")).toBeInTheDocument();
  });

  it("hides the activity line once the task has settled", () => {
    render(
      <ToolCallRow
        block={{ kind: "tool-call", title: "Visual QA for slides", status: "success", childSessionId: "c1" }}
        activity="python3 analyze slide-03.jpg"
      />,
    );
    expect(screen.queryByText("python3 analyze slide-03.jpg")).not.toBeInTheDocument();
  });

  it("expands a subagent row into its child thread on click", () => {
    const child = [
      { kind: "tool-call" as const, title: "webfetch stata.com/manual", status: "success" as const },
      { kind: "tool-call" as const, title: "webfetch statalist.org", status: "success" as const },
    ];
    render(
      <ToolCallRow
        block={{ kind: "tool-call", title: "explore", status: "running", childSessionId: "c1" }}
        activity="reading a manual"
        childBlocks={child}
        renderChildren={(blocks) => (
          <>
            {blocks.map((b, i) => (
              <div key={i}>{b.kind === "tool-call" ? b.title : ""}</div>
            ))}
          </>
        )}
      />,
    );
    // Collapsed: step count in the meta, child steps hidden.
    expect(screen.getByText(/2 steps/)).toBeInTheDocument();
    expect(screen.queryByText("webfetch statalist.org")).not.toBeInTheDocument();
    // Click the header to drill in.
    fireEvent.click(screen.getByRole("button", { name: /explore/ }));
    expect(screen.getByText("webfetch stata.com/manual")).toBeInTheDocument();
    expect(screen.getByText("webfetch statalist.org")).toBeInTheDocument();
  });

  it("shows the inline output of a user-run shell command", () => {
    render(
      <ToolCallRow
        block={{
          kind: "tool-call",
          title: "pwd",
          status: "success",
          outputSummary: "/ws/2026-07-04-1030",
        }}
      />,
    );
    expect(screen.getByText("/ws/2026-07-04-1030")).toBeInTheDocument();
  });
});
