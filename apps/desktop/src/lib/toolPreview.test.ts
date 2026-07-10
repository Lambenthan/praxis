import { describe, expect, it } from "vitest";
import { stataOutputPreview } from "./toolPreview";

describe("stataOutputPreview", () => {
  it("ignores non-Stata tools and empty output", () => {
    expect(stataOutputPreview("bash", "hello")).toBeUndefined();
    expect(stataOutputPreview("stata_do", "")).toBeUndefined();
    expect(stataOutputPreview("stata_do", undefined)).toBeUndefined();
  });

  it("flattens stata-mcp's JSON result to its readable text, dropping log paths", () => {
    const out = JSON.stringify({
      result: {
        log_file_path: { text: "/logs/run.log", smcl: "/logs/run.smcl" },
        log_content: { text: "There is no Stata return-code error in this execution." },
      },
    });
    const p = stataOutputPreview("mcp__stata-mcp__stata_do", out);
    // Bare log-file paths are noise in the panel — dropped; the message stays.
    expect(p).not.toContain("/logs/run.log");
    expect(p).not.toContain("/logs/run.smcl");
    expect(p).toContain("no Stata return-code error");
    expect(p).not.toContain("{");
  });

  it("passes a raw log through and keeps only the tail when long", () => {
    const log = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join("\n");
    const p = stataOutputPreview("stata_do", log)!;
    const lines = p.split("\n");
    expect(lines[0]).toBe("…");
    expect(lines).toHaveLength(25);
    expect(lines[lines.length - 1]).toBe("line 60");
    expect(p).not.toContain("line 1\n");
  });

  it("shows short raw output unchanged", () => {
    expect(stataOutputPreview("read_log_stata", "reg price mpg\nok")).toBe("reg price mpg\nok");
  });
});

describe("stataInputPreview", () => {
  it("surfaces the do-file (or log) path a Stata tool ran on", async () => {
    const { stataInputPreview } = await import("./toolPreview");
    expect(stataInputPreview("stata_do", { dofile_path: "/w/analysis.do" })).toBe("/w/analysis.do");
    expect(stataInputPreview("stata-mcp_read_log", { file_path: "/w/run.log" })).toBe(
      "/w/run.log",
    );
    expect(stataInputPreview("stata_do", { timeout: 60 })).toBeUndefined();
    expect(stataInputPreview("bash", { dofile_path: "/w/a.do" })).toBeUndefined();
  });
});
