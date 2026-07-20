import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  NotebookPen,
  Search,
} from "lucide-react";
import type {
  AgentConfigEntry,
  McpServer,
  OAuthAuthorization,
  ProviderAuthMethod,
  ProviderCatalogEntry,
  ProviderInfo,
  ReasoningEffort,
} from "@fishes/sdk";
import { useUiStore } from "@/lib/store";
import { useLocaleStore, useT } from "@/lib/i18n";
import { getClient, useRuntimeStore } from "@/lib/runtime";
import {
  importOpenCodeLogin,
  isTauri,
  jupyterStatus,
  openExternal,
  openWorkspaceBase,
  pickFolder,
  removeConfigEntry,
  setupJupyter,
  setWorkspaceBase,
  startJupyter,
  workspaceBase,
  type JupyterStatus,
} from "@/lib/tauri";
import { setupScienceMcp } from "@/lib/tauri";
import { ModelPicker } from "@/components/settings/ModelPicker";
import { SCIENCE_CONNECTORS, connectorConfig } from "@/lib/scienceConnectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import {
  SettingsNav,
  readSettingsTab,
  writeSettingsTab,
  type SettingsSectionId,
} from "@/features/settings/SettingsNav";
import { SettingsSection as Card } from "@/features/settings/SettingsSection";
import { SettingRow } from "@/features/settings/SettingRow";
import { useZoomStore, ZOOM_STEPS } from "@/lib/zoom";
import { AboutSection } from "@/features/settings/AboutSection";
import { PermissionsSection } from "@/features/settings/PermissionsSection";
import { inputCls, btnGhost, btnAccent } from "@/features/settings/controls";

/**
 * Settings. ONE configuration surface: everything talks to the bundled
 * OpenCode's own config/auth API — no separate "model key" concept.
 */
export function SettingsPage() {
  const navigate = useNavigate();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const t = useT();
  const { status, serverUrl, setServerUrl, connect, disconnect, defaultModel, agents, loadCatalog } =
    useRuntimeStore();
  const connected = status === "ready";

  // Which section the right pane shows. Persisted like CS's settings tab.
  const [tab, setTab] = useState<SettingsSectionId>(readSettingsTab);
  const selectTab = (id: SettingsSectionId) => {
    setTab(id);
    writeSettingsTab(id);
  };

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [authMethods, setAuthMethods] = useState<Record<string, ProviderAuthMethod[]>>({});
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([]);
  const [customIds, setCustomIds] = useState<string[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  // Per-agent config overrides Fishes has written (model / reasoningEffort).
  const [agentCfg, setAgentCfg] = useState<Record<string, AgentConfigEntry>>({});
  const [jupyter, setJupyter] = useState<JupyterStatus | null>(null);
  const [settingUpJupyter, setSettingUpJupyter] = useState(false);
  // Which curated science connector is currently being provisioned, by id.
  const [enablingConnector, setEnablingConnector] = useState<string | null>(null);
  // API keys typed for key-requiring connectors, keyed by connector id.
  const [connectorKeys, setConnectorKeys] = useState<Record<string, string>>({});

  // Add-MCP-server form.
  const [mName, setMName] = useState("");
  const [mType, setMType] = useState<"local" | "remote">("local");
  const [mTarget, setMTarget] = useState("");
  const [wsPath, setWsPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Custom endpoint form (self-hosted / Ollama / OpenAI- or Anthropic-compatible).
  const [showCustom, setShowCustom] = useState(false);
  const [cName, setCName] = useState("");
  const [cNpm, setCNpm] = useState("@ai-sdk/openai-compatible");
  const [cUrl, setCUrl] = useState("");
  const [cKey, setCKey] = useState("");
  const [cModels, setCModels] = useState("");

  // Connect-a-provider flow state.
  const [connectQuery, setConnectQuery] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [promptInputs, setPromptInputs] = useState<Record<string, string>>({});
  const [oauth, setOauth] = useState<
    (OAuthAuthorization & { providerID: string; methodIndex: number }) | null
  >(null);
  const [codeInput, setCodeInput] = useState("");
  // A pending browser-login wait: `oauthGen` invalidates it (cancel, restart,
  // or connecting some other way), `oauthAbort` also cancels its in-flight
  // callback request so retries never stack pending waits on the sidecar.
  const oauthGen = useRef(0);
  const oauthAbort = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    try {
      const [p, m, c, custom, mcp, aCfg] = await Promise.all([
        client.listProviders(),
        client.listAuthMethods(),
        client.listProviderCatalog(),
        client.listCustomProviderIds(),
        client.listMcpServers().catch(() => []),
        client.getAgentConfigs().catch(() => ({})),
      ]);
      setProviders(p);
      setAuthMethods(m);
      setCatalog(c.all);
      setCustomIds(custom);
      setMcpServers(mcp);
      setAgentCfg(aCfg);
      setJupyter(await jupyterStatus());
    } catch {
      /* runtime not ready yet */
    }
  }, []);

  useEffect(() => {
    if (connected) void refresh();
  }, [connected, refresh]);
  useEffect(() => {
    // The BASE folder — the parent every session's dated subfolder is created
    // under. (The per-session active folder shows in the conversation header.)
    void workspaceBase().then(setWsPath);
  }, []);

  const changeWorkspaceBase = async () => {
    const picked = await pickFolder();
    if (!picked) return;
    try {
      setWsPath(await setWorkspaceBase(picked));
      toast.success(t("New sessions will be created in this folder."));
    } catch (err) {
      toast.error(`${t("Could not set the folder:")} ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // The one post-change sequence — run() and the background OAuth wait must
  // stay in lockstep, so they share it instead of each keeping a copy.
  const refreshAll = async () => {
    await refresh();
    await loadCatalog();
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await refreshAll();
    } catch (e) {
      toast.error(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // Any action that cancels, restarts or bypasses the oauth flow must call
  // this: it invalidates the pending browser wait and aborts its request.
  const invalidateOauthWait = () => {
    oauthGen.current++;
    oauthAbort.current?.abort();
    oauthAbort.current = null;
  };

  const saveModel = (model: string) =>
    run(t("Could not set the model"), async () => {
      if (model) await getClient()!.setDefaultModel(model);
      toast.success(`${t("Default model set to")} ${model}`);
    });

  // Reasoning effort applies to the agents the user directly drives (primary /
  // "all" mode); dispatched worker subagents are governed by "Subagent model".
  const primaryAgents = agents.filter((a) => a.mode !== "subagent").map((a) => a.name);
  const subagents = agents.filter((a) => a.mode === "subagent").map((a) => a.name);
  // Current effort = the value shared by the primary agents (undefined if none set).
  const currentEffort: ReasoningEffort | undefined = primaryAgents
    .map((n) => agentCfg[n]?.reasoningEffort)
    .find((e): e is ReasoningEffort => Boolean(e));
  // Current subagent model = the one shared by the subagents (undefined if none set).
  const currentSubagentModel: string | undefined = subagents
    .map((n) => agentCfg[n]?.model)
    .find((mdl): mdl is string => Boolean(mdl));

  const saveReasoningEffort = (effort: ReasoningEffort) =>
    run(t("Could not set the reasoning effort"), async () => {
      const patch = Object.fromEntries(primaryAgents.map((n) => [n, { reasoningEffort: effort }]));
      await getClient()!.setAgentConfigs(patch);
      toast.success(`${t("Reasoning effort set to")} ${effort}`);
    });

  const saveSubagentModel = (model: string) =>
    run(t("Could not set the subagent model"), async () => {
      if (!model) return;
      const patch = Object.fromEntries(subagents.map((n) => [n, { model }]));
      await getClient()!.setAgentConfigs(patch);
      toast.success(`${t("Subagent model set to")} ${model}`);
    });

  const saveKey = (providerID: string) =>
    run(t("Could not save the key"), async () => {
      await getClient()!.setProviderApiKey(providerID, keyInput.trim());
      cancelOAuth(); // a pending browser login for this panel is now moot
      setKeyInput("");
      setConnectQuery("");
      toast.success(`${providerID} ${t("connected")}`);
    });

  const startOAuth = (providerID: string, methodIndex: number, inputs?: Record<string, string>) =>
    run(t("Could not start the login"), async () => {
      invalidateOauthWait(); // this flow replaces any pending one
      const gen = oauthGen.current;
      const auth = await getClient()!.oauthAuthorize(providerID, methodIndex, inputs);
      if (gen !== oauthGen.current) return; // cancelled while starting
      setOauth({ ...auth, providerID, methodIndex });
      await openExternal(auth.url);
      // "auto" flows finish on the browser redirect — the callback call below
      // WAITS for it, so run it in the background (never through `busy`, which
      // would lock the whole page for as long as the browser tab stays open).
      if (auth.method !== "code" && gen === oauthGen.current)
        void waitForBrowserLogin(providerID, methodIndex, gen);
    });

  const waitForBrowserLogin = async (providerID: string, methodIndex: number, gen: number) => {
    const abort = new AbortController();
    oauthAbort.current = abort;
    try {
      await getClient()!.oauthCallback(providerID, methodIndex, undefined, abort.signal);
      if (gen !== oauthGen.current) {
        // Cancelled in the UI, but the login DID complete — refresh silently
        // so the now-connected provider still shows up in the list.
        await refreshAll();
        return;
      }
      setOauth(null);
      toast.success(`${providerID} ${t("connected")}`);
      await refreshAll();
    } catch (e) {
      if (gen !== oauthGen.current) return; // cancelled — the abort is expected
      setOauth(null);
      toast.error(`${t("Login did not complete:")} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (oauthAbort.current === abort) oauthAbort.current = null;
    }
  };

  const cancelOAuth = () => {
    invalidateOauthWait();
    setOauth(null);
    setCodeInput("");
  };

  const completeOAuth = () =>
    run(t("Login did not complete"), async () => {
      if (!oauth) return;
      const { providerID, methodIndex } = oauth;
      invalidateOauthWait(); // the pasted code supersedes any browser wait
      await getClient()!.oauthCallback(providerID, methodIndex, codeInput.trim() || undefined);
      toast.success(`${providerID} ${t("connected")}`);
      setOauth(null);
      setCodeInput("");
    });

  const disconnectProvider = (providerID: string) =>
    run(t("Could not remove"), async () => {
      if (customIds.includes(providerID)) {
        // Custom endpoints live in the config file; removal restarts the sidecar.
        await removeConfigEntry("provider", providerID);
        await useRuntimeStore.getState().connectRetry();
      } else {
        await getClient()!.removeProviderAuth(providerID);
      }
      toast.success(`${providerID} ${t("removed")}`);
    });

  const saveCustom = () =>
    run(t("Could not add the endpoint"), async () => {
      const id = cName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const models = cModels.split(",").map((s) => s.trim()).filter(Boolean);
      if (!id || !cUrl.trim() || models.length === 0) {
        toast.error(t("Name, base URL and at least one model id are required."));
        return;
      }
      await getClient()!.addCustomProvider(id, {
        name: cName.trim(),
        npm: cNpm,
        baseURL: cUrl.trim(),
        apiKey: cKey.trim() || undefined,
        models,
      });
      toast.success(`${cName.trim()} ${t("added — its models are now selectable above.")}`);
      setShowCustom(false);
      setCName("");
      setCUrl("");
      setCKey("");
      setCModels("");
    });

  const addMcp = () =>
    run(t("Could not add the MCP server"), async () => {
      const name = mName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const target = mTarget.trim();
      if (!name || !target) {
        toast.error(t("Name and command/URL are required."));
        return;
      }
      await getClient()!.addMcpServer(
        name,
        mType === "local"
          ? { type: "local", command: target.split(/\s+/), enabled: true }
          : { type: "remote", url: target, enabled: true },
      );
      toast.success(`${t("MCP server")} ${name} ${t("added")}`);
      setMName("");
      setMTarget("");
    });

  // One click: uv provisions the isolated Jupyter env, the app starts the
  // server, and the MCP entry (URL + token) is written into OpenCode's config.
  const enableJupyter = async () => {
    setSettingUpJupyter(true);
    try {
      toast.success(t("Setting up Jupyter — first run downloads a few hundred MB, please wait…"));
      await setupJupyter();
      const s = await startJupyter();
      if (!s.url || !s.token || !s.mcp_command) throw new Error("setup finished incomplete");
      await getClient()!.addMcpServer("jupyter", {
        type: "local",
        command: [s.mcp_command],
        enabled: true,
        environment: { JUPYTER_URL: s.url, JUPYTER_TOKEN: s.token, ALLOW_IMG_OUTPUT: "true" },
      });
      toast.success(t("Jupyter MCP enabled — the agent can now drive notebooks."));
      await refreshAll();
    } catch (e) {
      toast.error(`${t("Jupyter setup failed:")} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSettingUpJupyter(false);
    }
  };

  // One click: uv provisions the open-source connector into the shared science
  // env, then its MCP entry is written into OpenCode's config.
  const enableConnector = async (id: string) => {
    const c = SCIENCE_CONNECTORS.find((x) => x.id === id);
    if (!c) return;
    setEnablingConnector(id);
    try {
      toast.success(`${t("Setting up")} ${t(c.label)} — ${t("first run downloads a managed Python, please wait…")}`);
      const python = await setupScienceMcp(c.pkg);
      await getClient()!.addMcpServer(c.id, connectorConfig(c, python, connectorKeys[c.id]));
      toast.success(`${t(c.label)} ${t("enabled — the agent can now use it from chat.")}`);
      setConnectorKeys((k) => ({ ...k, [c.id]: "" })); // don't keep the key in UI state
      await refreshAll();
    } catch (e) {
      toast.error(`${t(c.label)} ${t("setup failed:")} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEnablingConnector(null);
    }
  };

  const removeMcp = (name: string) =>
    run(t("Could not remove the MCP server"), async () => {
      await removeConfigEntry("mcp", name);
      await useRuntimeStore.getState().connectRetry();
      toast.success(`${t("MCP server")} ${name} ${t("removed")}`);
    });

  const importLogin = () =>
    run(t("Import failed"), async () => {
      const found = await importOpenCodeLogin();
      if (!found) {
        toast.error(t("No OpenCode CLI login found on this machine."));
        return;
      }
      // The sidecar restarted with the imported credentials — reconnect.
      await useRuntimeStore.getState().connectRetry();
      toast.success(t("Imported your OpenCode CLI login."));
    });

  // Resolve the search box to a catalog entry (by id or exact name).
  const q = connectQuery.trim().toLowerCase();
  const selected =
    catalog.find((p) => p.id === q) ?? catalog.find((p) => p.name.toLowerCase() === q) ?? null;
  // Every provider takes an API key via PUT /auth; special flows (OAuth) add to that.
  const methods: ProviderAuthMethod[] = selected
    ? [
        ...(authMethods[selected.id] ?? []).filter((m) => m.type === "oauth"),
        { type: "api", label: "API key" },
      ]
    : [];

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-8 pb-4 pt-8">
        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          {t("Workbench")}
        </div>
        <h1 className="mt-2 font-serif text-[22px] leading-tight text-text">{t("Settings")}</h1>
      </div>
      <div className="flex min-h-0 flex-1 border-t border-border">
        <SettingsNav active={tab} onSelect={selectTab} t={t} />
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-8 pb-16 pt-8">

        {/* ---- General (appearance) ---- */}
        {tab === "general" && (
          <Card title={t("General")} hint={t("Appearance and app-wide preferences.")}>
            <SettingRow
              label={t("Theme")}
              description={t("Match the app to your preferred light or dark appearance.")}
              control={
                <div className="inline-flex rounded-input border border-border bg-surface-2 p-0.5">
                  {(["light", "dark"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setTheme(opt)}
                      className={cn(
                        "rounded-[5px] px-4 py-1.5 text-[15px] capitalize transition-colors",
                        theme === opt
                          ? "bg-surface text-text shadow-card"
                          : "text-muted hover:text-text",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              }
            />
            <SettingRow
              label={t("Text size")}
              description={t("Scale the whole interface. Shortcuts: ⌘+ / ⌘− / ⌘0 (Ctrl on Windows), just like a browser.")}
              control={<ZoomControl />}
            />
          </Card>
        )}

        {/* ---- Agent runtime ---- */}
        {tab === "runtime" && (
        <Card title={t("Agent runtime")} hint={t("opencode serve, driven over its HTTP + SSE API")}>
          <div className="flex items-center gap-2">
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://127.0.0.1:4096"
              className={inputCls("flex-1 font-mono")}
            />
            {connected ? (
              <button onClick={disconnect} className={btnGhost()}>
                {t("Disconnect")}
              </button>
            ) : (
              <button onClick={connect} className={btnAccent()}>
                {t("Connect")}
              </button>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-muted">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                connected ? "bg-ok" : status === "error" ? "bg-error" : "bg-muted",
              )}
            />
            <span className="capitalize">{status}</span>
            {connected && defaultModel && (
              <>
                <span className="text-border">·</span>
                <span className="font-mono">{defaultModel}</span>
              </>
            )}
          </div>
        </Card>
        )}

        {/* ---- Models & providers ---- */}
        {tab === "model" && (
        <Card title={t("Model")} hint={t("Providers below supply the models you can pick here")}>
          {!connected ? (
            <div className="space-y-3">
              <p className="text-[15px] text-muted">
                {t("No model connected yet. Open the setup guide and paste your key there.")}
              </p>
              <button
                onClick={() => navigate("/setup")}
                className="flex h-9 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[15px] font-medium text-accent-fg transition-opacity hover:opacity-90"
              >
                {t("Open the setup guide")} <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <>
              <SettingRow
                label={t("Default model")}
                description={t("The model new sessions use. Providers below supply the choices.")}
                below={
                  <ModelPicker
                    providers={providers}
                    value={defaultModel}
                    onChange={(v) => void saveModel(v)}
                    disabled={busy}
                  />
                }
              />

              {primaryAgents.length > 0 && (
                <SettingRow
                  label={t("Reasoning effort")}
                  description={t(
                    "How hard a reasoning model thinks before answering. Ignored by models without a reasoning mode. Takes effect on new turns.",
                  )}
                  control={
                    <EffortPicker
                      value={currentEffort}
                      onChange={(e) => void saveReasoningEffort(e)}
                      disabled={busy}
                      t={t}
                    />
                  }
                />
              )}

              {subagents.length > 0 && (
                <SettingRow
                  label={t("Subagent model")}
                  description={t(
                    "The model dispatched worker subagents use. Leave unset to inherit the main model.",
                  )}
                  below={
                    <ModelPicker
                      providers={providers}
                      value={currentSubagentModel ?? null}
                      onChange={(v) => void saveSubagentModel(v)}
                      disabled={busy}
                    />
                  }
                />
              )}

              <Divider label={t("Providers")} />

              <div className="divide-y divide-border overflow-hidden rounded-input border border-border">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2.5 bg-surface px-3 py-3 text-[15px]"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
                    <span className="font-medium text-text">{p.name}</span>
                    <div className="flex-1" />
                    <span className="text-[12px] tabular-nums text-muted">
                      {p.models.length} {t(p.models.length === 1 ? "model" : "models")}
                    </span>
                    {p.id === "opencode" ? (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted ring-1 ring-border">
                        {t("built-in · free")}
                      </span>
                    ) : (
                      <button
                        className="text-xs text-muted transition-colors hover:text-error"
                        onClick={() => void disconnectProvider(p.id)}
                        disabled={busy}
                        title={t("Remove this provider's credentials/config")}
                      >
                        {t("Remove")}
                      </button>
                    )}
                  </div>
                ))}

                {/* Connect a provider */}
                <div className="bg-surface-2/50 p-3">
                  <div className="relative">
                    <Search
                      size={13}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    />
                    <input
                      list="provider-catalog"
                      value={connectQuery}
                      onChange={(e) => {
                        setConnectQuery(e.target.value);
                        cancelOAuth();
                        setPromptInputs({});
                      }}
                      placeholder={`${t("Connect a provider — search")} ${catalog.length} (anthropic, openrouter, deepseek…)`}
                      className={inputCls("w-full pl-8")}
                    />
                    <datalist id="provider-catalog">
                      {catalog.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </datalist>
                  </div>

                  {selected && (
                    <div className="mt-2 space-y-2">
                      {methods.map((m, i) =>
                        m.type === "oauth" ? (
                          <div key={i} className="space-y-1.5">
                            {(m.prompts ?? []).map((pr) =>
                              pr.type === "select" ? (
                                <select
                                  key={pr.key}
                                  value={promptInputs[pr.key] ?? ""}
                                  onChange={(e) =>
                                    setPromptInputs((s) => ({ ...s, [pr.key]: e.target.value }))
                                  }
                                  className={inputCls("w-full")}
                                >
                                  <option value="">{pr.message}</option>
                                  {(pr.options ?? []).map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                      {o.hint ? ` — ${o.hint}` : ""}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  key={pr.key}
                                  value={promptInputs[pr.key] ?? ""}
                                  onChange={(e) =>
                                    setPromptInputs((s) => ({ ...s, [pr.key]: e.target.value }))
                                  }
                                  placeholder={pr.message}
                                  className={inputCls("w-full")}
                                />
                              ),
                            )}
                            <button
                              className={btnGhost("gap-1.5")}
                              onClick={() => void startOAuth(selected.id, i, promptInputs)}
                              disabled={busy}
                            >
                              <ExternalLink size={12} /> {m.label}
                            </button>
                          </div>
                        ) : null,
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          placeholder={`${selected.name} ${t("API key")}${selected.env[0] ? ` (${selected.env[0]})` : ""}`}
                          className={inputCls("flex-1 font-mono")}
                        />
                        <button
                          className={btnAccent()}
                          onClick={() => void saveKey(selected.id)}
                          disabled={busy || !keyInput.trim()}
                        >
                          <Check size={13} /> {t("Save")}
                        </button>
                      </div>
                    </div>
                  )}

                  {oauth && (
                    <div className="mt-2 space-y-2 rounded-input border border-border bg-surface p-3">
                      <p className="text-xs leading-relaxed text-muted">{oauth.instructions}</p>
                      {oauth.method === "code" ? (
                        <>
                          <input
                            value={codeInput}
                            onChange={(e) => setCodeInput(e.target.value)}
                            placeholder={t("Paste the code from the browser")}
                            className={inputCls("w-full font-mono")}
                          />
                          <button
                            className={btnAccent()}
                            onClick={() => void completeOAuth()}
                            disabled={busy || !codeInput.trim()}
                          >
                            {busy ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Check size={13} />
                            )}
                            {t("Complete login")}
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <Loader2 size={12} className="shrink-0 animate-spin" />
                          {t("Waiting for you to finish in the browser…")}
                          <button
                            className="text-muted underline transition-colors hover:text-text"
                            onClick={cancelOAuth}
                          >
                            {t("Cancel")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Custom endpoint */}
                <div>
                  <button
                    className="flex h-10 w-full items-center gap-2 px-3 text-left text-[15px] text-muted transition-colors hover:text-text"
                    onClick={() => setShowCustom((s) => !s)}
                    aria-expanded={showCustom}
                  >
                    <ChevronRight
                      size={13}
                      className={cn("transition-transform", showCustom && "rotate-90")}
                    />
                    {t("Custom endpoint")}
                    <span className="text-xs text-muted/70">
                      {t("self-hosted · local Ollama · OpenAI/Anthropic-compatible")}
                    </span>
                  </button>
                  {showCustom && (
                    <div className="space-y-2 px-3 pb-3">
                      <div className="flex gap-2">
                        <input
                          value={cName}
                          onChange={(e) => setCName(e.target.value)}
                          placeholder={t("Name — e.g. Ollama, My DeepSeek gateway")}
                          className={inputCls("flex-1")}
                        />
                        <select
                          value={cNpm}
                          onChange={(e) => setCNpm(e.target.value)}
                          className={inputCls("w-[190px]")}
                        >
                          <option value="@ai-sdk/openai-compatible">{t("OpenAI-compatible")}</option>
                          <option value="@ai-sdk/anthropic">{t("Anthropic-compatible")}</option>
                        </select>
                      </div>
                      <input
                        value={cUrl}
                        onChange={(e) => setCUrl(e.target.value)}
                        placeholder={t("Base URL — Ollama: http://127.0.0.1:11434/v1")}
                        className={inputCls("w-full font-mono")}
                      />
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={cKey}
                          onChange={(e) => setCKey(e.target.value)}
                          placeholder={t("API key — optional, Ollama needs none")}
                          className={inputCls("flex-1 font-mono")}
                        />
                        <input
                          value={cModels}
                          onChange={(e) => setCModels(e.target.value)}
                          placeholder={t("Model ids, comma-separated")}
                          className={inputCls("flex-1 font-mono")}
                        />
                      </div>
                      <button className={btnAccent()} onClick={() => void saveCustom()} disabled={busy}>
                        {t("Add endpoint")}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isTauri && (
                <button
                  className="mt-3 flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-text"
                  onClick={() => void importLogin()}
                  disabled={busy}
                >
                  <Download size={12} />
                  {t("Already use the OpenCode CLI? Import its login")}
                </button>
              )}
            </>
          )}
        </Card>
        )}

        {/* ---- Connectors (MCP servers) ---- */}
        {tab === "connectors" && (
        <Card
          title={t("MCP servers")}
          hint={t("Extra tools for the agent (Model Context Protocol) — e.g. a Jupyter or browser MCP")}
        >
          {!connected ? (
            <p className="text-[15px] text-muted">{t("Connect the runtime to configure MCP servers.")}</p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-input border border-border">
              {/* Curated open-source science connectors — one-click enable. */}
              {isTauri &&
                SCIENCE_CONNECTORS.filter((c) => !mcpServers.some((s) => s.name === c.id)).map(
                  (c) => {
                    const keyMissing = Boolean(c.apiKeyEnv) && !connectorKeys[c.id]?.trim();
                    return (
                      <div key={c.id} className="bg-surface px-3 py-3 text-[15px]">
                        <div className="flex items-center gap-2.5">
                          <Search size={14} className="shrink-0 text-muted" />
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-text">{t(c.label)}</span>
                            <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted ring-1 ring-border">
                              {t(c.discipline)}
                            </span>
                            <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted ring-1 ring-border">
                              {t("open source")}
                            </span>
                            <div className="truncate text-xs text-muted">{t(c.description)}</div>
                            <div className="truncate font-mono text-[12px] text-muted/70">
                              {c.source}
                              {c.installNote ? ` · ${t(c.installNote)}` : ""}
                            </div>
                          </div>
                          <button
                            className={btnAccent("h-8")}
                            onClick={() => void enableConnector(c.id)}
                            disabled={enablingConnector !== null || busy || keyMissing}
                            title={keyMissing ? t("Enter the API key first") : undefined}
                          >
                            {enablingConnector === c.id ? (
                              <>
                                <Loader2 size={12} className="animate-spin" /> {t("Setting up…")}
                              </>
                            ) : (
                              t("Enable")
                            )}
                          </button>
                        </div>
                        {c.apiKeyEnv && (
                          <div className="mt-2 flex items-center gap-2 pl-6">
                            <input
                              type="password"
                              value={connectorKeys[c.id] ?? ""}
                              onChange={(e) =>
                                setConnectorKeys((k) => ({ ...k, [c.id]: e.target.value }))
                              }
                              placeholder={`${c.apiKeyEnv} (${t("free key")})`}
                              className="h-8 min-w-0 flex-1 rounded-input border border-border bg-surface-2 px-2 font-mono text-[12px] text-text placeholder:text-muted/60"
                            />
                            {c.apiKeyUrl && (
                              <a
                                href={c.apiKeyUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-accent hover:underline"
                              >
                                <ExternalLink size={11} /> {t("Get a free key")}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  },
                )}
              {/* Featured: one-click Jupyter (shown until its MCP entry exists). */}
              {isTauri && !mcpServers.some((s) => s.name === "jupyter") && (
                <div className="flex items-center gap-2.5 bg-surface px-3 py-3 text-[15px]">
                  <NotebookPen size={14} className="shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-text">Jupyter</span>
                    <span className="ml-2 text-xs text-muted">
                      {t("lets the agent drive real notebooks · isolated env, ~300 MB on first run")}
                    </span>
                  </div>
                  <button
                    className={btnAccent("h-8")}
                    onClick={() => void enableJupyter()}
                    disabled={settingUpJupyter || busy}
                  >
                    {settingUpJupyter ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> {t("Setting up…")}
                      </>
                    ) : jupyter?.installed ? (
                      t("Enable")
                    ) : (
                      t("Set up & enable")
                    )}
                  </button>
                </div>
              )}
              {mcpServers.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center gap-2.5 bg-surface px-3 py-3 text-[15px]"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      s.status === "connected"
                        ? "bg-ok"
                        : s.status === "failed"
                          ? "bg-error"
                          : "bg-muted",
                    )}
                  />
                  <span className="font-medium text-text">{s.name}</span>
                  <span className="text-xs text-muted">
                    {s.config?.type ?? "?"} · {s.status}
                  </span>
                  <span className="max-w-[260px] flex-1 truncate text-right font-mono text-[12px] tabular-nums text-muted/70">
                    {s.config?.type === "local"
                      ? s.config.command.join(" ")
                      : s.config?.type === "remote"
                        ? s.config.url
                        : ""}
                  </span>
                  <button
                    className="shrink-0 text-xs text-muted transition-colors hover:text-error"
                    onClick={() => void removeMcp(s.name)}
                    disabled={busy}
                  >
                    {t("Remove")}
                  </button>
                </div>
              ))}

              <div className="space-y-2 bg-surface-2/50 p-3">
                <div className="flex gap-2">
                  <input
                    value={mName}
                    onChange={(e) => setMName(e.target.value)}
                    placeholder={t("Name — e.g. jupyter, playwright")}
                    className={inputCls("flex-1")}
                  />
                  <select
                    value={mType}
                    onChange={(e) => setMType(e.target.value as "local" | "remote")}
                    className={inputCls("w-[110px]")}
                  >
                    <option value="local">{t("local")}</option>
                    <option value="remote">{t("remote")}</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    value={mTarget}
                    onChange={(e) => setMTarget(e.target.value)}
                    placeholder={
                      mType === "local"
                        ? t("Command — e.g. npx -y @playwright/mcp")
                        : t("URL — e.g. https://example.com/mcp")
                    }
                    className={inputCls("flex-1 font-mono")}
                  />
                  <button className={btnAccent()} onClick={() => void addMcp()} disabled={busy}>
                    {t("Add server")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Card>
        )}

        {/* Cluster (HPC), Modal compute and the data-flow explainer are
            deliberately NOT rendered yet — features ahead of the product's
            current audience. The components remain in the tree for when
            they're wanted back. */}

        {/* ---- Data (workspace folder) ---- */}
        {tab === "data" && (
        <Card
          title={t("Data")}
          hint={t("Local-first — each session works in its own dated subfolder created here")}
        >
          <SettingRow
            label={t("Workspace folder")}
            description={t("The base folder new sessions are created under.")}
            below={
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    inputCls("flex-1 truncate font-mono leading-9"),
                    "select-all bg-surface-2 text-muted",
                  )}
                >
                  {wsPath ?? t("available in the desktop app")}
                </span>
                {wsPath && (
                  <>
                    <button className={btnGhost("gap-1.5")} onClick={() => void changeWorkspaceBase()}>
                      {t("Change…")}
                    </button>
                    <button className={btnGhost("gap-1.5")} onClick={() => void openWorkspaceBase()}>
                      <FolderOpen size={13} /> {t("Reveal")}
                    </button>
                  </>
                )}
              </div>
            }
          />
        </Card>
        )}

        {/* ---- Language ---- */}
        {tab === "language" && (
        <Card title={t("Language")} hint={t("The language Fishes's own interface is shown in.")}>
          <SettingRow
            label={t("Interface language")}
            description={t("Applies to Fishes's menus and labels, not your chats.")}
            control={
              <div className="inline-flex rounded-input border border-border bg-surface-2 p-0.5">
                {(
                  [
                    { value: "en" as const, label: "English" },
                    { value: "zh" as const, label: "中文" },
                  ]
                ).map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setLocale(option.value)}
                    className={cn(
                      "rounded-[5px] px-4 py-1.5 text-[15px] transition-colors",
                      locale === option.value
                        ? "bg-surface text-text shadow-card"
                        : "text-muted hover:text-text",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          />
        </Card>
        )}

        {/* ---- About ---- */}
        {tab === "about" && <AboutSection />}

        {/* ---- Permissions ---- */}
        {tab === "permissions" && <PermissionsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Local bit: the providers divider used only in the Model section ---- */

function Divider({ label }: { label: string }) {
  return (
    <div className="mb-3 mt-5 flex items-center gap-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/* ---- Local bit: the reasoning-effort segmented control (Model section) ---- */

const EFFORT_LEVELS: ReasoningEffort[] = ["minimal", "low", "medium", "high"];

function EffortPicker({
  value,
  onChange,
  disabled,
  t,
}: {
  value: ReasoningEffort | undefined;
  onChange: (e: ReasoningEffort) => void;
  disabled: boolean;
  t: (s: string) => string;
}) {
  return (
    <div className="inline-flex rounded-input border border-border bg-surface-2 p-0.5">
      {EFFORT_LEVELS.map((level) => (
        <button
          key={level}
          onClick={() => onChange(level)}
          disabled={disabled}
          className={cn(
            "rounded-[5px] px-3 py-1.5 text-[13px] capitalize transition-colors disabled:opacity-50",
            value === level ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
          )}
        >
          {t(level)}
        </button>
      ))}
    </div>
  );
}

/** Browser-style zoom stepper: − [percent] +, with a Reset when off 100%. */
function ZoomControl() {
  const t = useT();
  const zoom = useZoomStore((s) => s.zoom);
  const zoomIn = useZoomStore((s) => s.zoomIn);
  const zoomOut = useZoomStore((s) => s.zoomOut);
  const resetZoom = useZoomStore((s) => s.resetZoom);
  const atMin = zoom <= ZOOM_STEPS[0];
  const atMax = zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return (
    <div className="inline-flex items-center gap-2">
      <div className="inline-flex items-center rounded-input border border-border bg-surface-2 p-0.5">
        <button
          onClick={zoomOut}
          disabled={atMin}
          aria-label={t("Zoom out")}
          className="rounded-[5px] px-3 py-1.5 text-[15px] leading-none text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          −
        </button>
        <span className="min-w-[3.5rem] text-center text-[14px] tabular-nums text-text">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={zoomIn}
          disabled={atMax}
          aria-label={t("Zoom in")}
          className="rounded-[5px] px-3 py-1.5 text-[15px] leading-none text-muted transition-colors hover:text-text disabled:opacity-40"
        >
          +
        </button>
      </div>
      {zoom !== 1 && (
        <button
          onClick={resetZoom}
          className="text-[13px] text-muted underline underline-offset-2 hover:text-text"
        >
          {t("Reset")}
        </button>
      )}
    </div>
  );
}
