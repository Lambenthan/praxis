import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepActionsPanel, StepsMenuButton } from "./StepActions";
import { STEP_ACTIONS } from "./WorkflowStarters";

describe("StepActions", () => {
  it("panel lists both lanes' steps in sequence and runs one on click", async () => {
    const onRun = vi.fn();
    render(<StepActionsPanel workspaceName="耐心资本测试" onRun={onRun} />);
    expect(screen.getByText("耐心资本测试")).toBeInTheDocument();
    expect(screen.getByText("Quantitative workflow")).toBeInTheDocument();
    expect(screen.getByText("Qualitative workflow")).toBeInTheDocument();
    for (const s of STEP_ACTIONS) {
      expect(screen.getByText(s.title)).toBeInTheDocument();
    }
    // One click runs directly — the prompt is workspace-context, no blanks.
    await userEvent.click(screen.getByText("Data merging"));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun.mock.calls[0][0]).toContain("in this workspace");
    expect(onRun.mock.calls[0][0]).not.toContain("[attach");
  });

  it("every step prompt is self-contained against the workspace (no fill-ins)", () => {
    for (const s of STEP_ACTIONS) {
      expect(s.prompt).toContain("workspace");
      expect(s.prompt).not.toMatch(/\[attach|\[Y\]|\[X\]/);
    }
  });

  it("the header menu opens, runs a step, and closes", async () => {
    const onRun = vi.fn();
    render(<StepsMenuButton onRun={onRun} />);
    await userEvent.click(screen.getByText("Steps"));
    expect(screen.getByText("Research design")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Robustness checks"));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun.mock.calls[0][0]).toContain("robustness");
    expect(screen.queryByText("Research design")).not.toBeInTheDocument(); // closed
  });
});
