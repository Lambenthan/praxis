import { describe, expect, it } from "vitest";
import {
  flattenSteps,
  parsePlan,
  parsePlanStatus,
  planProgress,
  stepStatus,
} from "./plan";

/** The version-3-style schema the agent convention specifies. */
const PLAN = {
  version: 3,
  task_summary: "核对候选图并产出报告",
  created_at: "2026-07-19T10:00:00Z",
  phases: [
    {
      id: "phase-0",
      name: "建图与数据统计核对",
      depends_on: [],
      steps: [
        { id: "s1", title: "核对候选图与数据集统计", description: "从真值源文件独立重建" },
        { id: "s2", title: "跑通全量管线" },
      ],
    },
    {
      id: "phase-1",
      name: "写报告",
      depends_on: ["phase-0"],
      steps: [{ id: "s3", title: "汇总产出报告", description: "含全部数字" }],
    },
  ],
  desired_outputs: ["report.md"],
  feasibility: { confidence: "high", rationale: "数据齐全" },
};

describe("parsePlan", () => {
  it("parses the version-3 schema into phases and steps", () => {
    const plan = parsePlan(JSON.stringify(PLAN));
    expect(plan).not.toBeNull();
    expect(plan!.version).toBe(3);
    expect(plan!.taskSummary).toBe("核对候选图并产出报告");
    expect(plan!.phases).toHaveLength(2);
    expect(plan!.phases[0].name).toBe("建图与数据统计核对");
    expect(plan!.phases[1].dependsOn).toEqual(["phase-0"]);
    expect(flattenSteps(plan!).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(plan!.desiredOutputs).toEqual(["report.md"]);
    expect(plan!.feasibility).toEqual({ confidence: "high", rationale: "数据齐全" });
  });

  it("tolerates CS's phases→delegations→steps nesting", () => {
    const plan = parsePlan(
      JSON.stringify({
        version: 3,
        phases: [
          {
            id: "phase-0",
            name: "analysis",
            delegations: [
              { agent: "worker-1", steps: [{ id: "s1", title: "delegated step" }] },
            ],
          },
        ],
      }),
    );
    expect(plan).not.toBeNull();
    expect(flattenSteps(plan!)).toEqual([{ id: "s1", title: "delegated step", description: undefined }]);
  });

  it("synthesizes stable ids for steps the agent left unkeyed", () => {
    const plan = parsePlan(
      JSON.stringify({
        phases: [{ id: "phase-0", name: "p", steps: [{ title: "untagged step" }] }],
      }),
    );
    expect(flattenSteps(plan!)[0].id).toBe("phase-0-s1");
  });

  it("returns null for malformed input (bad JSON, wrong shape, empty plan)", () => {
    expect(parsePlan("{not json")).toBeNull();
    expect(parsePlan(JSON.stringify({ models: [] }))).toBeNull();
    expect(parsePlan(JSON.stringify({ phases: "nope" }))).toBeNull();
    expect(parsePlan(JSON.stringify({ phases: [] }))).toBeNull();
    // phases with no titled steps render nothing → plan hides entirely
    expect(parsePlan(JSON.stringify({ phases: [{ id: "p", name: "p", steps: [{}] }] }))).toBeNull();
  });
});

describe("parsePlanStatus", () => {
  it("keeps known statuses and their notes, drops unknown ones", () => {
    const status = parsePlanStatus(
      JSON.stringify({
        steps: {
          s1: { status: "completed", note: "从5个真值源文件独立重建,全部精确匹配" },
          s2: { status: "in_progress" },
          s3: { status: "definitely-not-a-status" },
        },
      }),
    );
    expect(status).toEqual({
      steps: {
        s1: { status: "completed", note: "从5个真值源文件独立重建,全部精确匹配" },
        s2: { status: "in_progress" },
      },
    });
  });

  it("returns null for bad JSON or a missing steps map", () => {
    expect(parsePlanStatus("{oops")).toBeNull();
    expect(parsePlanStatus(JSON.stringify({}))).toBeNull();
    expect(parsePlanStatus(JSON.stringify({ steps: "nope" }))).toBeNull();
  });
});

describe("stepStatus", () => {
  const step = { id: "s1", title: "核对候选图与数据集统计" };

  it("matches by id first", () => {
    const status = { steps: { s1: { status: "completed" as const } } };
    expect(stepStatus(step, status).status).toBe("completed");
  });

  it("falls back to the exact title when the agent keyed by title", () => {
    const status = { steps: { 核对候选图与数据集统计: { status: "skipped" as const } } };
    expect(stepStatus(step, status).status).toBe("skipped");
  });

  it("reads as pending when the overlay is absent or silent", () => {
    expect(stepStatus(step, null)).toEqual({ status: "pending" });
    expect(stepStatus(step, { steps: {} })).toEqual({ status: "pending" });
  });
});

describe("planProgress", () => {
  const plan = parsePlan(JSON.stringify(PLAN))!;

  it("counts completed + skipped as done and points at the in_progress step", () => {
    const status = parsePlanStatus(
      JSON.stringify({
        steps: { s1: { status: "completed" }, s2: { status: "in_progress" } },
      }),
    )!;
    const p = planProgress(plan, status);
    expect(p).toMatchObject({ done: 1, total: 3 });
    expect(p.current?.id).toBe("s2");
  });

  it("with no overlay, everything is pending and the first step is current", () => {
    const p = planProgress(plan, null);
    expect(p).toMatchObject({ done: 0, total: 3 });
    expect(p.current?.id).toBe("s1");
  });

  it("with everything resolved, current is null and done equals total", () => {
    const status = parsePlanStatus(
      JSON.stringify({
        steps: {
          s1: { status: "completed" },
          s2: { status: "skipped" },
          s3: { status: "completed" },
        },
      }),
    )!;
    expect(planProgress(plan, status)).toEqual({ done: 3, total: 3, current: null });
  });

  it("a blocked step stays un-done and becomes current when nothing runs", () => {
    const status = parsePlanStatus(
      JSON.stringify({
        steps: { s1: { status: "completed" }, s2: { status: "blocked", note: "缺输入文件" } },
      }),
    )!;
    const p = planProgress(plan, status);
    expect(p).toMatchObject({ done: 1, total: 3 });
    expect(p.current?.id).toBe("s2");
  });
});
