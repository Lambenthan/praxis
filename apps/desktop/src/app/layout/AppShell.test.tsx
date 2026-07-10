import { render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "@/app/router";
import { useRuntimeStore } from "@/lib/runtime";

// The first-run redirect keys off provider state and only fires under Tauri.
const getDefaultModel = vi.fn(async (): Promise<string | null> => null);

vi.mock("@/lib/runtime", async (orig) => {
  const m = (await orig()) as Record<string, unknown>;
  return { ...m, getClient: () => ({ getDefaultModel, listMcpServers: async () => [] }) };
});
vi.mock("@/lib/tauri", async (orig) => {
  const m = (await orig()) as Record<string, unknown>;
  return { ...m, isTauri: true, ensureJupyter: async () => {}, detectTools: async () => [] };
});

const renderApp = () =>
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/live"] })} />);

describe("AppShell first-run redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // bootstrap() would try to reach a real runtime — stub it to a no-op that
    // flips the store to ready, which is the signal the redirect waits on.
    useRuntimeStore.setState({
      status: "ready",
      bootstrap: async () => {
        useRuntimeStore.setState({ status: "ready" });
      },
    });
  });

  it("sends a fresh install (no own provider) to the setup guide", async () => {
    getDefaultModel.mockResolvedValue(null);
    renderApp();
    await waitFor(() =>
      expect(screen.getByText("Three steps and the workbench is ready")).toBeInTheDocument(),
    );
  });

  it("leaves a configured install on its normal page", async () => {
    getDefaultModel.mockResolvedValue("deepseek/deepseek-chat");
    renderApp();
    // Give the async model check time to resolve, then confirm no redirect.
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByText("Three steps and the workbench is ready")).not.toBeInTheDocument();
  });
});
