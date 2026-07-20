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
  addCustomProvider: vi.fn(async () => {}),
  setDefaultModel: vi.fn(async () => {}),
  addMcpServer: vi.fn(async () => {}),
  createSession: vi.fn(async () => "diag-session"),
  sendPrompt: vi.fn(async () => {}),
  deleteSession: vi.fn(async () => {}),
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
    resetScienceMcpEnv: vi.fn(async () => {}),
    // The Rust command returns the resolved executable's PATH; the page
    // formats it into an edition name ("StataMP") for display.
    testStataBridge: vi.fn(async () => "/Applications/Stata/StataMP.app/Contents/MacOS/stata-mp"),
    verifyProviderKey: vi.fn(async () => {}),
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
    expect(screen.getByText("Connect a model (required)")).toBeInTheDocument();
    expect(screen.getAllByText("Connect Stata").length).toBeGreaterThan(0);
    expect(screen.getByText("Open a project to work in")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Connect Stata (optional)")).toBeInTheDocument());
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
    // Never pre-disabled: an empty click explains itself and saves nothing.
    await userEvent.click(save);
    expect(client.setProviderApiKey).not.toHaveBeenCalled();
    await userEvent.type(screen.getByPlaceholderText("DeepSeek API key"), "sk-test");
    await userEvent.click(save);
    await waitFor(() => expect(client.setProviderApiKey).toHaveBeenCalledWith("deepseek", "sk-test"));
    await waitFor(() =>
      expect(client.setDefaultModel).toHaveBeenCalledWith("deepseek/deepseek-chat"),
    );
  });

  it("saving during startup verifies at once, then waits for the runtime — never 'try again later'", async () => {
    useRuntimeStore.setState({ status: "connecting" }); // first boot, sidecar not up yet
    client.setProviderApiKey.mockImplementation(async () => {
      client.listProviders.mockResolvedValue([
        { id: "opencode", name: "OpenCode", models: [] },
        { id: "deepseek", name: "DeepSeek", models: [{ id: "deepseek-chat", name: "chat" }] },
      ]);
    });
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("DeepSeek API key"), "sk-test");
    await userEvent.click(screen.getByText("Save"));
    // The key was verified against the provider directly (no runtime needed);
    // the save is parked, visibly, until the runtime finishes booting.
    expect(await screen.findByText(/setting up Fishes/)).toBeInTheDocument();
    expect(client.setProviderApiKey).not.toHaveBeenCalled();
    // Runtime comes up → the save completes by itself, as the banner promises.
    useRuntimeStore.setState({ status: "ready" });
    await waitFor(() => expect(client.setProviderApiKey).toHaveBeenCalledWith("deepseek", "sk-test"));
  });

  it("a failing key pins an inline error under the field — no vanishing toast", async () => {
    const tauri = await import("@/lib/tauri");
    vi.mocked(tauri.verifyProviderKey).mockRejectedValueOnce(
      new Error("no_balance: HTTP 402 Insufficient Balance"),
    );
    renderPage();
    await userEvent.type(screen.getByPlaceholderText("DeepSeek API key"), "sk-broke");
    await userEvent.click(screen.getByText("Save"));
    expect(await screen.findByText(/no balance/)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 402/)).toBeInTheDocument();
    expect(client.setProviderApiKey).not.toHaveBeenCalled();
    // Typing again clears the pinned error.
    await userEvent.type(screen.getByPlaceholderText("DeepSeek API key"), "x");
    expect(screen.queryByText(/no balance/)).not.toBeInTheDocument();
  });

  it("the custom-endpoint door adds the provider and defaults to its first model", async () => {
    client.addCustomProvider.mockImplementation(async () => {
      client.listProviders.mockResolvedValue([
        { id: "opencode", name: "OpenCode", models: [] },
        { id: "my-ollama", name: "My Ollama", models: [{ id: "llama3", name: "llama3" }] },
      ]);
    });
    renderPage();
    await userEvent.click(screen.getByText("Custom endpoint"));
    // Never pre-disabled: an empty click explains what is missing, saves nothing.
    await userEvent.click(screen.getByText("Add endpoint"));
    expect(client.addCustomProvider).not.toHaveBeenCalled();
    expect(await screen.findByText(/at least one model id/)).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/Name — e.g. Ollama/), "My Ollama");
    await userEvent.type(
      screen.getByPlaceholderText(/Base URL/),
      "http://127.0.0.1:11434/v1",
    );
    await userEvent.type(screen.getByPlaceholderText(/Model ids/), "llama3, qwen3");
    await userEvent.click(screen.getByText("Add endpoint"));
    await waitFor(() =>
      expect(client.addCustomProvider).toHaveBeenCalledWith("my-ollama", {
        name: "My Ollama",
        npm: "@ai-sdk/openai-compatible",
        baseURL: "http://127.0.0.1:11434/v1",
        apiKey: undefined,
        models: ["llama3", "qwen3"],
      }),
    );
    expect(client.setDefaultModel).toHaveBeenCalledWith("my-ollama/llama3");
    // The custom path never touches the preset key channel, and the card must
    // not claim a live check that never ran.
    expect(client.setProviderApiKey).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText(/Verified with a live request/)).not.toBeInTheDocument(),
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
    // No Stata connected here, so the demo is the bundled-Python regression —
    // a user who skipped the optional Stata step still gets a working analysis.
    expect(useUiStore.getState().composerDraft).toContain("statsmodels");
  });

  it("a Stata MCP entry marks step two as done and re-verifies the bridge live", async () => {
    client.listMcpServers.mockResolvedValue([{ name: "stata", status: "connected" }]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Stata is connected/)).toBeInTheDocument(),
    );
    // The result card states a verified fact — the edition name, not the raw
    // executable path the bridge test actually returned.
    expect(await screen.findByText(/Connected: StataMP/)).toBeInTheDocument();
    expect(screen.getByText("Recheck")).toBeInTheDocument();
  });

  it("a broken env self-heals: silent reset + retry, no error ever shown", async () => {
    const tauri = await import("@/lib/tauri");
    client.listProviders.mockResolvedValue([
      { id: "opencode", name: "OpenCode", models: [] },
      { id: "deepseek", name: "DeepSeek", models: [{ id: "deepseek-chat", name: "chat" }] },
    ]);
    vi.mocked(tauri.setupScienceMcp)
      .mockRejectedValueOnce(new Error("bridge_import: pip blew up mid-install"))
      .mockResolvedValueOnce("/managed/bin/python");
    client.addMcpServer.mockImplementation(async () => {
      client.listMcpServers.mockResolvedValue([{ name: "stata", status: "connected" }]);
    });
    renderPage();
    const enable = (await screen.findByText("Connect Stata")).closest("button")!;
    await waitFor(() => expect(enable).not.toBeDisabled()); // unlocks once step 1 is done
    await userEvent.click(enable);
    await waitFor(() => expect(screen.getAllByText(/StataMP/).length).toBeGreaterThan(0));
    expect(vi.mocked(tauri.resetScienceMcpEnv)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(tauri.setupScienceMcp)).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/did not install cleanly/)).not.toBeInTheDocument();
  });

  it("a residual failure hands the raw error to OpenCode for a live diagnosis", async () => {
    const tauri = await import("@/lib/tauri");
    client.listProviders.mockResolvedValue([
      { id: "opencode", name: "OpenCode", models: [] },
      { id: "deepseek", name: "DeepSeek", models: [{ id: "deepseek-chat", name: "chat" }] },
    ]);
    vi.mocked(tauri.setupScienceMcp).mockRejectedValue(
      new Error("provider_error: disk is full"),
    );
    renderPage();
    const enable = (await screen.findByText("Connect Stata")).closest("button")!;
    await waitFor(() => expect(enable).not.toBeDisabled());
    await userEvent.click(enable);
    // Self-heal retries once, then the raw failure is handed to the OpenCode
    // agent — the visible diagnosis panel mounts and a session is created.
    await waitFor(() =>
      expect(screen.getByText("Handing the failure to Fishes…")).toBeInTheDocument(),
    );
    expect(vi.mocked(tauri.resetScienceMcpEnv)).toHaveBeenCalledTimes(1);
    expect(client.createSession).toHaveBeenCalled();
  });

  it("connecting a model collapses step 1 into a result card with the model picker", async () => {
    client.listProviders.mockResolvedValue([
      { id: "opencode", name: "OpenCode", models: [] },
      { id: "deepseek", name: "DeepSeek", models: [{ id: "deepseek-chat", name: "chat" }] },
    ]);
    useRuntimeStore.setState({ defaultModel: "deepseek/deepseek-chat" });
    renderPage();
    // Result card: what is connected + the current-model picker, no key form.
    await waitFor(() => expect(screen.getAllByText(/Connected/).length).toBeGreaterThan(0));
    expect(screen.getByLabelText("Current model")).toHaveValue("deepseek/deepseek-chat");
    expect(screen.queryByPlaceholderText("DeepSeek API key")).not.toBeInTheDocument();
    // The guidance bar asks the need-based Stata question (Stata is on disk).
    expect(
      await screen.findByText(/Will you use Stata for analysis/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Not now — enter the workbench/)).toBeInTheDocument();
    // "Change…" reopens the form.
    await userEvent.click(screen.getByText("Change provider or API key…"));
    expect(screen.getByPlaceholderText("DeepSeek API key")).toBeInTheDocument();
  });
});
