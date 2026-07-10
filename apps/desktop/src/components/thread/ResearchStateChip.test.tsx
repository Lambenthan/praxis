import { describe, expect, it } from "vitest";
import { parseResearchState } from "./ResearchStateChip";

describe("parseResearchState", () => {
  it("reads the phase and counts only open decisions", () => {
    const s = parseResearchState(
      JSON.stringify({
        version: 1,
        phase: "analysis",
        open_decisions: [
          { id: "d1", status: "decided" },
          { id: "d2", status: "open" },
          { id: "d3", status: "deferred" },
          { id: "d4", status: "open" },
        ],
      }),
    );
    expect(s).toEqual({ phase: "analysis", pending: 2 });
  });

  it("tolerates a state file with no decisions yet", () => {
    expect(parseResearchState(JSON.stringify({ phase: "framing" }))).toEqual({
      phase: "framing",
      pending: 0,
    });
  });

  it("rejects non-state JSON and broken JSON (chip hides)", () => {
    expect(parseResearchState(JSON.stringify({ models: [] }))).toBeNull();
    expect(parseResearchState("{not json")).toBeNull();
  });
});
