import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SetupGate } from "./SetupGate";
import { SETUP_DONE_KEY, useRuntimeStore } from "@/lib/runtime";

const client = {
  listProviders: vi.fn(async (): Promise<unknown[]> => [
    { id: "opencode", name: "OpenCode", models: [] },
  ]),
};
// Disk truth (auth.json exists?) — defaults to "configured" so the localStorage
// scenarios below stay in charge unless a test overrides it.
const setupCompletedOnDisk = vi.fn(async () => true);

vi.mock("@/lib/runtime", async (orig) => {
  const m = (await orig()) as Record<string, unknown>;
  return { ...m, getClient: () => client };
});

vi.mock("@/lib/tauri", async (orig) => {
  const m = (await orig()) as Record<string, unknown>;
  return { ...m, isTauri: true, setupCompletedOnDisk: () => setupCompletedOnDisk() };
});

function Probe() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SetupGate />
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SetupGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    client.listProviders.mockResolvedValue([{ id: "opencode", name: "OpenCode", models: [] }]);
    setupCompletedOnDisk.mockResolvedValue(true);
    useRuntimeStore.setState({ status: "ready", setupNeeded: null });
  });

  it("a stale 'done' memory with no key on disk routes to setup before the runtime is up", async () => {
    // localStorage says setup completed, but the app data (auth.json) is gone —
    // e.g. wiped or a new machine. The webview memory must lose to disk truth,
    // and the user must not sit on a dead workbench while the sidecar boots.
    window.localStorage.setItem(SETUP_DONE_KEY, "1");
    useRuntimeStore.setState({ status: "connecting" });
    setupCompletedOnDisk.mockResolvedValue(false);
    renderAt("/live");
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/setup"));
    expect(client.listProviders).not.toHaveBeenCalled(); // no sidecar needed
    // The stale flag is cleared, so the NEXT launch routes synchronously.
    expect(window.localStorage.getItem(SETUP_DONE_KEY)).toBeNull();
  });

  it("a first launch lands on the guide before the runtime is even ready", async () => {
    useRuntimeStore.setState({ status: "connecting" });
    renderAt("/live");
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/setup"));
    // No runtime yet — the persisted flag routed, not the live check.
    expect(client.listProviders).not.toHaveBeenCalled();
  });

  it("a completed install boots straight in — no guide flash", async () => {
    window.localStorage.setItem(SETUP_DONE_KEY, "1");
    client.listProviders.mockResolvedValue([
      { id: "opencode", name: "OpenCode", models: [] },
      { id: "deepseek", name: "DeepSeek", models: [] },
    ]);
    renderAt("/live");
    await waitFor(() => expect(client.listProviders).toHaveBeenCalled());
    expect(screen.getByTestId("path")).toHaveTextContent("/live");
  });

  it("a fresh install is redirected to the setup guide from anywhere", async () => {
    renderAt("/live");
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/setup"));
  });

  it("a configured install is left alone", async () => {
    window.localStorage.setItem(SETUP_DONE_KEY, "1");
    client.listProviders.mockResolvedValue([
      { id: "opencode", name: "OpenCode", models: [] },
      { id: "deepseek", name: "DeepSeek", models: [] },
    ]);
    renderAt("/live");
    await waitFor(() => expect(client.listProviders).toHaveBeenCalled());
    expect(screen.getByTestId("path")).toHaveTextContent("/live");
  });

  it("fails CLOSED: a persistent check failure still redirects to the guide", async () => {
    window.localStorage.setItem(SETUP_DONE_KEY, "1"); // an install that WAS set up
    client.listProviders.mockRejectedValue(new Error("ipc broke"));
    renderAt("/live");
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/setup"), {
      timeout: 5000,
    });
    expect(client.listProviders).toHaveBeenCalledTimes(3); // retried with backoff
  });

  it("releases the moment SetupPage marks setup done", async () => {
    // Simulate the state after a verified key was saved on the guide.
    useRuntimeStore.setState({ setupNeeded: false });
    renderAt("/live");
    // The check is skipped (already decided) and no redirect ever fires.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("path")).toHaveTextContent("/live");
    expect(client.listProviders).not.toHaveBeenCalled();
  });
});
