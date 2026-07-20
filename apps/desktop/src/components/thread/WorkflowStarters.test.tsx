import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NAVIGATOR_STARTER,
  WORKFLOW_STARTERS,
  WorkflowStarters,
  projectFolderName,
} from "./WorkflowStarters";
import { useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";

const tauriMocks = vi.hoisted(() => ({
  pickFolder: vi.fn(async (): Promise<string | null> => "/materials/dir"),
}));
vi.mock("@/lib/tauri", () => ({
  isTauri: true,
  installExample: async (name: string) => name,
  pickFolder: tauriMocks.pickFolder,
  workspaceBase: async () => "/Users/x/Desktop/Fishes",
}));

describe("WorkflowStarters", () => {
  beforeEach(() => {
    useUiStore.setState({ composerDraft: null, guidedMode: false });
  });

  it("projectFolderName makes a shell-safe, space-free folder segment", () => {
    expect(projectFolderName("Patient capital and green transition")).toBe(
      "Patient-capital-and-green-transition",
    );
    expect(projectFolderName("  耐心资本  研究  ")).toBe("耐心资本-研究"); // CJK kept, spaces → -
    expect(projectFolderName("a/b:c*?")).toBe("abc"); // path-illegal chars dropped
    expect(projectFolderName("...")).toBe(""); // nothing usable → caller falls back
  });

  it("the gate is only the project entries — no demos, no steps", () => {
    render(<WorkflowStarters onPick={() => {}} />);
    // The two ways into a project.
    expect(screen.getByText("Start a project from zero")).toBeInTheDocument();
    expect(screen.getByText("I already have research materials")).toBeInTheDocument();
    // Demos were removed from the gate; steps live inside a project.
    expect(screen.queryByText("Try it (demos)")).not.toBeInTheDocument();
    expect(screen.queryByText("Research design")).not.toBeInTheDocument();
    expect(screen.queryByText("Baseline regressions")).not.toBeInTheDocument();
  });

  it("every demo starter is self-contained (send mode) — used by the setup demo", () => {
    for (const s of WORKFLOW_STARTERS) {
      expect(s.mode).toBe("send");
    }
  });

  it("every starter belongs to a lane and declares a mode", () => {
    for (const s of WORKFLOW_STARTERS) {
      expect(["qual", "quant"]).toContain(s.group);
      expect(["fill", "send"]).toContain(s.mode);
      expect(s.prompt.length).toBeGreaterThan(20);
    }
  });

  it("the guided fresh path names a project folder, then sends under the navigator", async () => {
    useUiStore.setState({ guidedMode: true });
    const onPick = vi.fn();
    const switchWorkspace = vi.fn(async () => {});
    useRuntimeStore.setState({ switchWorkspace });
    render(<WorkflowStarters onPick={onPick} />);
    // "Start fresh" opens the naming dialog — it does not send yet.
    await userEvent.click(screen.getByText("Start a project from zero"));
    expect(onPick).not.toHaveBeenCalled();
    const box = screen.getByPlaceholderText(/Patient capital/i);
    await userEvent.type(box, "耐心资本 与 绿色转型{Enter}");
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    // Spaces collapse to hyphens so the shell path stays intact.
    expect(switchWorkspace).toHaveBeenCalledWith({ dated: "耐心资本-与-绿色转型" });
    expect(useRuntimeStore.getState().draftAgent).toBe("research-navigator");
    expect(NAVIGATOR_STARTER.agent).toBe("research-navigator");
  });

  it("Change… routes the project into the picked folder", async () => {
    useUiStore.setState({ guidedMode: true });
    tauriMocks.pickFolder.mockResolvedValueOnce("/Volumes/Research");
    const onPick = vi.fn();
    const switchWorkspace = vi.fn(async (_t: { dated?: string; path?: string }) => {});
    useRuntimeStore.setState({ switchWorkspace });
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("Start a project from zero"));
    await userEvent.click(screen.getByText("Change…"));
    await userEvent.type(screen.getByPlaceholderText(/Patient capital/i), "耐心资本{Enter}");
    await waitFor(() => expect(switchWorkspace).toHaveBeenCalledTimes(1));
    expect(switchWorkspace.mock.calls[0][0]).toEqual({ path: "/Volumes/Research/耐心资本" });
  });

  it("a blank name creates no project (a name is required — no dated fallback)", async () => {
    useUiStore.setState({ guidedMode: true });
    const onPick = vi.fn();
    const switchWorkspace = vi.fn(async (_target: { dated?: string; path?: string }) => {});
    useRuntimeStore.setState({ switchWorkspace });
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("Start a project from zero"));
    await userEvent.click(screen.getByText("Create & start"));
    // Nothing happens: no workspace switch, no dated folder — the user must name it.
    expect(switchWorkspace).not.toHaveBeenCalled();
  });

  it("the materials path pins the picked folder first, then sends under the navigator", async () => {
    useUiStore.setState({ guidedMode: true });
    const onPick = vi.fn();
    const switchWorkspace = vi.fn(async () => {});
    useRuntimeStore.setState({ switchWorkspace });
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("I already have research materials"));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(switchWorkspace).toHaveBeenCalledWith({ path: "/materials/dir" });
    expect(useRuntimeStore.getState().draftAgent).toBe("research-navigator");
    expect(onPick.mock.calls[0][0]).toContain("take stock");
  });

  it("autonomous (default): materials pins the folder but sends nothing and binds no agent", async () => {
    const onPick = vi.fn();
    const switchWorkspace = vi.fn(async () => {});
    useRuntimeStore.setState({ switchWorkspace, draftAgent: "research-navigator" });
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("I already have research materials"));
    await waitFor(() => expect(switchWorkspace).toHaveBeenCalledWith({ path: "/materials/dir" }));
    expect(onPick).not.toHaveBeenCalled(); // the researcher speaks first
    expect(useRuntimeStore.getState().draftAgent).toBeNull();
  });

  it("autonomous (default): naming creates the folder without the navigator or an auto-send", async () => {
    const onPick = vi.fn();
    const switchWorkspace = vi.fn(async () => {});
    useRuntimeStore.setState({ switchWorkspace, draftAgent: null });
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("Start a project from zero"));
    await userEvent.type(screen.getByPlaceholderText(/Patient capital/i), "耐心资本{Enter}");
    await waitFor(() => expect(switchWorkspace).toHaveBeenCalledWith({ dated: "耐心资本" }));
    expect(onPick).not.toHaveBeenCalled();
    expect(useRuntimeStore.getState().draftAgent).toBeNull();
  });

  it("cancelling the folder pick starts nothing", async () => {
    tauriMocks.pickFolder.mockResolvedValueOnce(null);
    const onPick = vi.fn();
    const switchWorkspace = vi.fn(async () => {});
    useRuntimeStore.setState({ switchWorkspace });
    render(<WorkflowStarters onPick={onPick} />);
    await userEvent.click(screen.getByText("I already have research materials"));
    await new Promise((r) => setTimeout(r, 10));
    expect(switchWorkspace).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

});
