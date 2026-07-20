import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parsePlan, parsePlanStatus } from "@/lib/plan";
import { PlanPanel } from "./PlanPanel";

const plan = parsePlan(
  JSON.stringify({
    version: 3,
    task_summary: "Verify the candidate graph against the dataset",
    phases: [
      {
        id: "phase-0",
        name: "建图与数据统计核对",
        depends_on: [],
        steps: [
          { id: "s1", title: "核对候选图与数据集统计", description: "从真值源文件独立重建" },
          { id: "s2", title: "跑通全量管线" },
          { id: "s3", title: "旧格式导出", description: "已被新导出替代" },
        ],
      },
    ],
    desired_outputs: ["report.md"],
  }),
)!;

const status = parsePlanStatus(
  JSON.stringify({
    steps: {
      s1: { status: "completed", note: "从5个真值源文件独立重建,全部精确匹配" },
      s2: { status: "in_progress" },
      s3: { status: "skipped" },
    },
  }),
)!;

describe("PlanPanel", () => {
  it("renders the phase header, every step, and the gray italic result note", () => {
    render(<PlanPanel plan={plan} status={status} />);
    expect(screen.getByText(/Phase\s*1/)).toBeInTheDocument();
    expect(screen.getByText("建图与数据统计核对")).toBeInTheDocument();
    expect(screen.getByText("核对候选图与数据集统计")).toBeInTheDocument();
    expect(screen.getByText("从真值源文件独立重建")).toBeInTheDocument();
    const note = screen.getByText("从5个真值源文件独立重建,全部精确匹配");
    expect(note.className).toContain("italic");
    expect(screen.getByText("report.md")).toBeInTheDocument();
  });

  it("marks each step row with its status (id match, absent = pending)", () => {
    const { container } = render(<PlanPanel plan={plan} status={status} />);
    const byStatus = (s: string) =>
      [...container.querySelectorAll(`li[data-status="${s}"]`)].map((li) => li.textContent);
    expect(byStatus("completed").join("")).toContain("核对候选图与数据集统计");
    expect(byStatus("in_progress").join("")).toContain("跑通全量管线");
    expect(byStatus("skipped").join("")).toContain("旧格式导出");
  });

  it("renders every step as pending when there is no status overlay yet", () => {
    const { container } = render(<PlanPanel plan={plan} status={null} />);
    expect(container.querySelectorAll('li[data-status="pending"]')).toHaveLength(3);
  });
});
