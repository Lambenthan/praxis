import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadBlock } from "@fishes/shared";
import { BlockList } from "./BlockList";
import { MarkdownViewer } from "@/components/markdown-viewer/MarkdownViewer";

// Count markdown parses instead of timing them: each call of this mock stands
// for one full remark+KaTeX re-parse in production.
vi.mock("@/components/markdown-viewer/MarkdownViewer", () => ({
  MarkdownViewer: vi.fn(({ children }: { children: string }) => <div>{children}</div>),
}));
const viewer = MarkdownViewer as unknown as ReturnType<typeof vi.fn>;

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

  it("re-parses ONLY the block a streamed update touched, not every past message", () => {
    // Fake timers: the streaming block's throttled re-parse stays scheduled
    // (never fired mid-test), so the parse count below is deterministic.
    vi.useFakeTimers();
    // The exact shape a streaming turn produces: foldEvent copies the array
    // but keeps every untouched block's identity, replacing just the one the
    // event updated.
    const settled: ThreadBlock = { kind: "agent", markdown: "an earlier, settled reply" };
    const before: ThreadBlock[] = [settled, { kind: "agent", markdown: "streaming repl" }];
    const { rerender } = render(<BlockList blocks={before} />);
    const initialParses = viewer.mock.calls.length; // one parse per message
    expect(initialParses).toBeGreaterThanOrEqual(2);
    // One more token arrives.
    const after: ThreadBlock[] = [settled, { kind: "agent", markdown: "streaming reply" }];
    rerender(<BlockList blocks={after} />);
    // Memoized rows: the settled message is NOT re-parsed — only the row the
    // token touched renders again. (Before memoization this was one parse per
    // message per token.)
    expect(viewer.mock.calls.length - initialParses).toBe(1);
    vi.useRealTimers();
  });
});
