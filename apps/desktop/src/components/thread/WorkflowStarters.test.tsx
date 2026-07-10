import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAVIGATOR_STARTER, WORKFLOW_STARTERS, WorkflowStarters } from "./WorkflowStarters";
import { useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";

const tauriMocks = vi.hoisted(() => ({
  pickFolder: vi.fn(async (): Promise<string | null> => "/materials/dir"),
}));
vi.mock("@/lib/tauri", () => ({
  isTauri: true,
  installExample: async (name: string) => name,
  pickFolder: tauriMocks.pickFolder,
}));

describe("WorkflowStarters", () => {
  beforeEach(() => {
    useUiStore.setState({ composerDraft: null });
  });

  it("renders every scenario card under its research-lane group", () => {
    render(<WorkflowStarters onPick={() => {}} />);
    for (const s of WORKFLOW_STARTERS) {
      expect(screen.getByText(s.title)).toBeInTheDocument();
    }
    expect(screen.getByText("Qualitative research")).toBeInTheDocument();
    expect(screen.getByText("Quantitative research")).toBeInTheDocument();
  });

  it("a template card prefills the composer and does NOT send", async () => {
    const onPick = vi.fn();
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("Open coding"));
    await waitFor(() =>
      expect(useUiStore.getState().composerDraft).toContain("Open-code this interview"),
    );
    expect(onPick).not.toHaveBeenCalled();
  });

  it("a demo card sends its self-contained prompt immediately", async () => {
    const onPick = vi.fn();
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("Code a sample interview"));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0][0]).toContain(".qcode");
    expect(useUiStore.getState().composerDraft).toBeNull();
  });

  it("the quant demo card targets Stata's auto data and a .qreg artifact", async () => {
    const onPick = vi.fn();
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("Regressions on auto data"));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0][0]).toContain("sysuse auto");
    expect(onPick.mock.calls[0][0]).toContain("results.qreg");
  });

  it("every starter belongs to a lane and declares a mode", () => {
    for (const s of WORKFLOW_STARTERS) {
      expect(["qual", "quant"]).toContain(s.group);
      expect(["fill", "send"]).toContain(s.mode);
      expect(s.prompt.length).toBeGreaterThan(20);
    }
  });

  it("the guided fresh path binds the navigator agent to the next session and sends", async () => {
    const onPick = vi.fn();
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("Start fresh"));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(useRuntimeStore.getState().draftAgent).toBe("research-navigator");
    expect(NAVIGATOR_STARTER.agent).toBe("research-navigator");
  });

  it("the materials path pins the picked folder first, then sends under the navigator", async () => {
    const onPick = vi.fn();
    const switchWorkspace = vi.fn(async () => {});
    useRuntimeStore.setState({ switchWorkspace });
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("Start from my materials"));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(switchWorkspace).toHaveBeenCalledWith({ path: "/materials/dir" });
    expect(useRuntimeStore.getState().draftAgent).toBe("research-navigator");
    expect(onPick.mock.calls[0][0]).toContain("take stock");
  });

  it("cancelling the folder pick starts nothing", async () => {
    tauriMocks.pickFolder.mockResolvedValueOnce(null);
    const onPick = vi.fn();
    const switchWorkspace = vi.fn(async () => {});
    useRuntimeStore.setState({ switchWorkspace });
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("Start from my materials"));
    await new Promise((r) => setTimeout(r, 10));
    expect(switchWorkspace).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("a plain card clears any leftover resident-agent choice", async () => {
    useRuntimeStore.setState({ draftAgent: "research-navigator" });
    render(<WorkflowStarters onPick={() => {}} />);
    await userEvent.click(screen.getByText("Open coding"));
    await waitFor(() => expect(useRuntimeStore.getState().draftAgent).toBeNull());
  });
});
