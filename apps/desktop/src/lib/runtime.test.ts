import { describe, expect, it } from "vitest";
import type { OpenCodeEvent, HistoryMessage } from "@ai4s/sdk";
import { datedWorkspaceName, foldEvent, historyToThread, subagentActivity, tidyToolTitle, type FoldState } from "./runtime";

const empty: FoldState = { blocks: [], index: {} };
const S = "ses_1";
const foldAll = (events: OpenCodeEvent[]): FoldState =>
  events.reduce((s, e) => foldEvent(s, e), empty);

describe("tidyToolTitle", () => {
  it("shows workspace files by their relative path", () => {
    expect(tidyToolTitle("/Users/asq/Documents/OpenScience/demo/analyze.py")).toBe("demo/analyze.py");
    expect(tidyToolTitle("mkdir -p /Users/asq/Documents/OpenScience/demo_analysis")).toBe(
      "mkdir -p demo_analysis",
    );
    // OpenCode's write-tool titles drop the leading slash — must still relativize.
    expect(tidyToolTitle("Users/asq/Documents/OpenScience/demo_analysis/analyze.py")).toBe(
      "demo_analysis/analyze.py",
    );
  });
  it("leaves non-workspace titles unchanged", () => {
    expect(tidyToolTitle("search (done)")).toBe("search (done)");
    expect(tidyToolTitle("python3 -c \"import numpy\"")).toBe('python3 -c "import numpy"');
  });
  it("shows the basename of a file written outside the workspace (e.g. a temp dir)", () => {
    expect(
      tidyToolTitle("/var/folders/b6/r76df1td3cxgjd1wsbwm8cpr0000gn/T/opencode/auto_describe.do"),
    ).toBe("auto_describe.do");
    // A bare absolute path with no dir still returns cleanly.
    expect(tidyToolTitle("/tmp/x.do")).toBe("x.do");
  });
});

describe("datedWorkspaceName", () => {
  it("formats a zero-padded YYYY-MM-DD-HHMM folder name", () => {
    expect(datedWorkspaceName(new Date(2026, 6, 4, 16, 5))).toBe("2026-07-04-1605");
    expect(datedWorkspaceName(new Date(2026, 0, 9, 3, 40))).toBe("2026-01-09-0340");
  });
});

describe("foldEvent", () => {
  it("upserts a text part by id (idempotent full-text updates, not appends)", () => {
    const s = foldAll([
      { type: "text.updated", sessionId: S, partId: "p1", text: "Planning" },
      { type: "text.updated", sessionId: S, partId: "p1", text: "Planning the review" },
    ]);
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0]).toEqual({ kind: "agent", markdown: "Planning the review" });
  });

  it("upserts a tool call by callId and reflects status transitions", () => {
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "search", status: "running", title: "search" },
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "search", status: "success", title: "search (done)" },
    ]);
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0]).toMatchObject({ kind: "tool-call", status: "success", title: "search (done)" });
  });

  it("does not render interactive question/permission tools as thread rows", () => {
    // These are surfaced by InteractionPrompt (answerable), not as blank rows.
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "q1", tool: "question", status: "running", title: "" },
      { type: "tool.updated", sessionId: S, callId: "p1", tool: "permission", status: "running", title: "" },
    ]);
    expect(s.blocks).toHaveLength(0);
  });

  it("drops opaque todo tool rows from the conversation", () => {
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "t1", tool: "todowrite", status: "success", title: "4 todos" },
    ]);
    expect(s.blocks).toHaveLength(0);
  });

  it("never blanks a tool row when the completed event reports an empty title", () => {
    // Completed MCP tool parts carry title: "" — the tool name must survive.
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "jupyter_insert_cell", status: "running" },
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "jupyter_insert_cell", status: "success", title: "" },
    ]);
    expect(s.blocks[0]).toMatchObject({
      kind: "tool-call",
      status: "success",
      title: "jupyter_insert_cell",
    });
  });

  it("shows the file path for a file tool that has no title yet", () => {
    // OpenCode only sets a write/edit tool's title on completion — while the
    // tool runs, the file path in its input is the only thing worth showing.
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "write", status: "running", input: { filePath: "/Users/asq/Documents/OpenScience/2026-07-04/index.html", content: "<!doctype html>" } },
    ]);
    expect(s.blocks[0]).toMatchObject({
      kind: "tool-call",
      status: "running",
      title: "2026-07-04/index.html",
    });
  });

  it("surfaces a written file as an artifact block, deduped by path", () => {
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "write", status: "running", input: { filePath: "fig.py" } },
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "write", status: "success", input: { filePath: "fig.py", content: "print(1)" } },
    ]);
    const artifacts = s.blocks.filter((b) => b.kind === "artifact");
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({ kind: "artifact", filename: "fig.py", artifact: "script", content: "print(1)" });
    // The tool-call row is still present alongside the artifact.
    expect(s.blocks.some((b) => b.kind === "tool-call")).toBe(true);
  });

  it("keeps distinct parts as separate blocks in arrival order", () => {
    const s = foldAll([
      { type: "text.updated", sessionId: S, partId: "p1", text: "planning" },
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "search", status: "success" },
      { type: "text.updated", sessionId: S, partId: "p2", text: "done" },
      { type: "session.idle", sessionId: S },
    ]);
    expect(s.blocks.map((b) => b.kind)).toEqual(["agent", "tool-call", "agent", "status-line"]);
  });
});

describe("subagent activity", () => {
  it("records the child session id on a task tool block", () => {
    const s = foldAll([
      {
        type: "tool.updated",
        sessionId: S,
        callId: "c1",
        tool: "task",
        status: "running",
        title: "Visual QA for slides",
        childSessionId: "ses_child",
      },
    ]);
    expect(s.blocks[0]).toMatchObject({ kind: "tool-call", childSessionId: "ses_child" });
  });

  it("subagentActivity: shows the child's latest tool step", () => {
    const child = foldAll([
      { type: "tool.updated", sessionId: "ses_child", callId: "k1", tool: "bash", status: "success", title: "pdftoppm -jpeg slides.pdf" },
      { type: "tool.updated", sessionId: "ses_child", callId: "k2", tool: "bash", status: "running", title: "python3 analyze slide-03.jpg" },
    ]);
    expect(subagentActivity(child.blocks)).toBe("python3 analyze slide-03.jpg");
  });

  it("subagentActivity: 'Writing…' while the child is streaming text", () => {
    const child = foldAll([
      { type: "tool.updated", sessionId: "ses_child", callId: "k1", tool: "bash", status: "success", title: "ls" },
      { type: "text.updated", sessionId: "ses_child", partId: "p1", text: "Compiling the final report" },
    ]);
    expect(subagentActivity(child.blocks)).toBe("Writing…");
  });

  it("subagentActivity: 'Working…' when nothing is known yet", () => {
    expect(subagentActivity(undefined)).toBe("Working…");
    expect(subagentActivity([])).toBe("Working…");
  });

  it("keeps the child link when a later update omits it", () => {
    const s = foldAll([
      {
        type: "tool.updated",
        sessionId: S,
        callId: "c1",
        tool: "task",
        status: "running",
        title: "Visual QA for slides",
        childSessionId: "ses_child",
      },
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "task", status: "running", title: "Visual QA for slides" },
    ]);
    expect(s.blocks[0]).toMatchObject({ kind: "tool-call", childSessionId: "ses_child" });
  });
});

describe("historyToThread", () => {
  it("converts user/assistant messages (text + tool parts) into blocks", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "planning" },
          { type: "tool", tool: "search", state: { status: "completed", title: "search" } },
        ],
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks.map((b) => b.kind)).toEqual(["user", "agent", "tool-call"]);
    expect(t.blocks[2]).toMatchObject({ kind: "tool-call", status: "success" });
  });

  it("renders a user-run '!' shell turn like the live path: '! cmd' + inline output", () => {
    // OpenCode records a "!" run as a synthetic user text + a bash tool part.
    const msgs: HistoryMessage[] = [
      {
        role: "user",
        parts: [{ type: "text", text: "The following tool was executed by the user", synthetic: true }],
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: "bash",
            state: { status: "completed", title: "", input: { command: "pwd" }, output: "/ws/here\n" },
          },
        ],
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks).toEqual([
      { kind: "user", text: "! pwd" },
      {
        kind: "tool-call",
        title: "pwd",
        status: "success",
        inputSummary: "pwd",
        outputSummary: "/ws/here",
      },
    ]);
  });

  it("falls back to the bash command as the row title (agent steps too)", () => {
    const msgs: HistoryMessage[] = [
      {
        role: "assistant",
        parts: [
          { type: "tool", tool: "bash", state: { status: "completed", title: "", input: { command: "ls -la" } } },
        ],
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks[0]).toMatchObject({ kind: "tool-call", title: "ls -la" });
    // An agent bash step (no synthetic marker) never shows inline output.
    expect(t.blocks[0]).not.toHaveProperty("outputSummary");
  });

  it("never spins in history: frozen running/pending steps become quiet + one interrupted line", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: "explore" }] },
      {
        role: "assistant",
        parts: [
          { type: "tool", tool: "read", state: { status: "running", title: "README.md" } },
          { type: "tool", tool: "glob", state: { status: "pending", title: "*.md" } },
        ],
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks[1]).toMatchObject({ kind: "tool-call", status: "pending" });
    expect(t.blocks[2]).toMatchObject({ kind: "tool-call", status: "pending" });
    const last = t.blocks[t.blocks.length - 1];
    expect(last).toMatchObject({ kind: "status-line", tone: "error" });
  });

  it("shows a slash command as what the user typed, not its expanded template", () => {
    // OpenCode stores the EXPANDED command/skill template as the user message,
    // with typed arguments appended — reverse-map via the known templates.
    const template = "\nThis skill guides growth for indie AI products…\n\n## Core Philosophy\n…";
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: template.trim() }] },
      { role: "assistant", parts: [{ type: "text", text: "on it" }] },
      { role: "user", parts: [{ type: "text", text: `${template.trim()}\n\n帮我设计增长方式` }] },
    ];
    const t = historyToThread(msgs, [
      { name: "growth-marketing", source: "skill", template },
    ]);
    expect(t.blocks[0]).toEqual({ kind: "user", text: "/growth-marketing" });
    expect(t.blocks[2]).toEqual({ kind: "user", text: "/growth-marketing 帮我设计增长方式" });
  });

  it("leaves a long pasted user text alone when it matches no template", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: "a genuinely long pasted question…" }] },
    ];
    const t = historyToThread(msgs, [{ name: "init", template: "something else" }]);
    expect(t.blocks[0]).toEqual({ kind: "user", text: "a genuinely long pasted question…" });
  });

  it("adds no interrupted line when every step finished", () => {
    const msgs: HistoryMessage[] = [
      {
        role: "assistant",
        parts: [{ type: "tool", tool: "read", state: { status: "completed", title: "README.md" } }],
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks.every((b) => b.kind !== "status-line")).toBe(true);
  });
});

describe("coding-step folding", () => {
  const codingText =
    "开放编码\n```coding\n" +
    JSON.stringify({ quote: "演戏", code: "表演性", memo: "r" }) +
    "\n```\n```coding\n" +
    JSON.stringify({ quote: "更狠", code: "自我驱动" }) +
    "\n```";

  it("folds live ```coding blocks into coding-step cards, stripped from the prose", () => {
    const s = foldAll([{ type: "text.updated", sessionId: S, partId: "p1", text: codingText }]);
    const cards = s.blocks.filter((b) => b.kind === "coding-step");
    expect(cards.map((c) => (c as { code: string }).code)).toEqual(["表演性", "自我驱动"]);
    const agent = s.blocks.find((b) => b.kind === "agent") as { markdown: string } | undefined;
    expect(agent?.markdown).not.toContain("```coding");
    expect(agent?.markdown).toContain("开放编码");
  });

  it("adds a card as each block streams in (idempotent upsert by index)", () => {
    const one = "```coding\n" + JSON.stringify({ quote: "演戏", code: "表演性" }) + "\n```";
    let s = foldAll([{ type: "text.updated", sessionId: S, partId: "p1", text: one }]);
    expect(s.blocks.filter((b) => b.kind === "coding-step")).toHaveLength(1);
    s = foldEvent(s, { type: "text.updated", sessionId: S, partId: "p1", text: codingText });
    expect(s.blocks.filter((b) => b.kind === "coding-step")).toHaveLength(2);
  });

  it("rebuilds coding-step cards from history", () => {
    const t = historyToThread([{ role: "assistant", parts: [{ type: "text", text: codingText }] }]);
    expect(t.blocks.filter((b) => b.kind === "coding-step")).toHaveLength(2);
  });
});
