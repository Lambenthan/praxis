import { describe, expect, it } from "vitest";
import type { ToolUpdatedEvent } from "@ai4s/sdk";
import { provenanceInputFromEvent } from "./provenance";

const write = (over: Partial<ToolUpdatedEvent> = {}): ToolUpdatedEvent => ({
  type: "tool.updated",
  sessionId: "ses_1",
  callId: "call_1",
  tool: "write",
  status: "success",
  input: { filePath: "fig/plot.py", content: "print(1)" },
  ...over,
});

describe("provenanceInputFromEvent", () => {
  it("derives a record from a successful write with its content", () => {
    const r = provenanceInputFromEvent(write({ title: "Rewrote the plotting helper" }));
    expect(r).toEqual({
      path: "fig/plot.py",
      tool: "write",
      content: "print(1)",
      log: "Rewrote the plotting helper",
    });
  });

  it("replaces path-only or empty titles with a compact tool → path log", () => {
    // OpenCode write titles are usually just the file path — redundant.
    const paths = provenanceInputFromEvent(write({ title: "Users/x/OpenScience/fig/plot.py" }));
    expect(paths?.log).toBe("write → fig/plot.py");
    const empty = provenanceInputFromEvent(write({ title: "" }));
    expect(empty?.log).toBe("write → fig/plot.py");
  });

  it("ignores non-success, non-write, and pathless events", () => {
    expect(provenanceInputFromEvent(write({ status: "running" }))).toBeNull();
    expect(provenanceInputFromEvent(write({ tool: "bash" }))).toBeNull();
    expect(provenanceInputFromEvent(write({ input: {} }))).toBeNull();
  });

  it("records mutating jupyter tools but not reads", () => {
    const jupyter = (tool: string) =>
      write({ tool, input: { notebook_path: "analysis.ipynb" } });
    expect(provenanceInputFromEvent(jupyter("jupyter_insert_cell"))?.path).toBe("analysis.ipynb");
    expect(provenanceInputFromEvent(jupyter("jupyter_execute_cell"))?.path).toBe("analysis.ipynb");
    expect(provenanceInputFromEvent(jupyter("jupyter_read_cells"))).toBeNull();
    expect(provenanceInputFromEvent(jupyter("jupyter_list_files"))).toBeNull();
  });
});
