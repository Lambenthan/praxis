import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockList } from "./BlockList";

describe("BlockList", () => {
  it("feeds a running task row the live activity of its subagent", () => {
    render(
      <BlockList
        blocks={[
          { kind: "tool-call", title: "Visual QA for slides", status: "running", childSessionId: "ses_child" },
        ]}
        handlers={{
          subagentActivity: (id) => (id === "ses_child" ? "python3 analyze slide-03.jpg" : undefined),
        }}
      />,
    );
    expect(screen.getByText("python3 analyze slide-03.jpg")).toBeInTheDocument();
  });

  it("asks for no activity on rows that spawned no subagent", () => {
    render(
      <BlockList
        blocks={[{ kind: "tool-call", title: "ls -la", status: "running" }]}
        handlers={{
          subagentActivity: () => {
            throw new Error("must not be called without a childSessionId");
          },
        }}
      />,
    );
    expect(screen.getByText("ls -la")).toBeInTheDocument();
  });
});
