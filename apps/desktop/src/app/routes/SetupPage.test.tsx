import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SetupPage } from "./SetupPage";
import { useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";

const client = {
  listProviders: vi.fn(async (): Promise<unknown[]> => [
    { id: "opencode", name: "OpenCode", models: [] },
  ]),
  listMcpServers: vi.fn(async (): Promise<unknown[]> => []),
  getDefaultModel: vi.fn(async (): Promise<string | null> => null),
  setProviderApiKey: vi.fn(async () => {}),
  setDefaultModel: vi.fn(async () => {}),
  addMcpServer: vi.fn(async () => {}),
};

vi.mock("@/lib/runtime", async (orig) => {
  const m = (await orig()) as Record<string, unknown>;
  return { ...m, getClient: () => client };
});

vi.mock("@/lib/tauri", async (orig) => {
  const m = (await orig()) as Record<string, unknown>;
  return {
    ...m,
    isTauri: true,
    detectTools: async () => [{ name: "Stata", found: true }],
    setupScienceMcp: vi.fn(async () => "/managed/bin/python"),
    openExternal: vi.fn(async () => {}),
  };
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <SetupPage />
    </MemoryRouter>,
  );

describe("SetupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.listProviders.mockResolvedValue([{ id: "opencode", name: "OpenCode", models: [] }]);
    client.listMcpServers.mockResolvedValue([]);
    useRuntimeStore.setState({ status: "ready" });
    useUiStore.setState({ composerDraft: null });
  });

  it("walks the three steps in order", async () => {
    renderPage();
    expect(screen.getByText("Connect a model")).toBeInTheDocument();
    expect(screen.getAllByText("Enable Stata").length).toBeGreaterThan(0);
    expect(screen.getByText("Run the two-minute demo")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Stata was detected/)).toBeInTheDocument());
  });

  it("saving a key connects the provider and sets a model it really serves", async () => {
    client.setProviderApiKey.mockImplementation(async () => {
      client.listProviders.mockResolvedValue([
        { id: "opencode", name: "OpenCode", models: [] },
        { id: "deepseek", name: "DeepSeek", models: [{ id: "deepseek-chat", name: "chat" }] },
      ]);
    });
    renderPage();
    const save = screen.getByText("Save").closest("button")!;
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("DeepSeek API key"), "sk-test");
    expect(save).not.toBeDisabled();
    await userEvent.click(save);
    await waitFor(() => expect(client.setProviderApiKey).toHaveBeenCalledWith("deepseek", "sk-test"));
    await waitFor(() =>
      expect(client.setDefaultModel).toHaveBeenCalledWith("deepseek/deepseek-chat"),
    );
  });

  it("the demo stays locked until a model is connected, then prefills the composer", async () => {
    client.listProviders.mockResolvedValue([
      { id: "opencode", name: "OpenCode", models: [] },
      { id: "deepseek", name: "DeepSeek", models: [{ id: "deepseek-chat", name: "chat" }] },
    ]);
    renderPage();
    const demo = screen.getByText("Open the demo").closest("button")!;
    await waitFor(() => expect(demo).not.toBeDisabled());
    await userEvent.click(demo);
    expect(useUiStore.getState().composerDraft).toContain("sysuse auto");
  });

  it("a Stata MCP entry marks step two as done", async () => {
    client.listMcpServers.mockResolvedValue([{ name: "stata", status: "connected" }]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Stata is connected/)).toBeInTheDocument(),
    );
  });
});
