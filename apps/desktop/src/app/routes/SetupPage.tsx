import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import type { McpServer, ProviderInfo } from "@ai4s/sdk";
import { getClient, useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";
import { detectTools, isTauri, openExternal, setupScienceMcp } from "@/lib/tauri";
import { SCIENCE_CONNECTORS, connectorConfig } from "@/lib/scienceConnectors";
import { WORKFLOW_STARTERS } from "@/components/thread/WorkflowStarters";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/** Providers a first-time user can connect without knowing what a provider is:
 *  pick one, paste a key, done. Everything else lives in Settings. The model
 *  is a wish — after the key saves we set it only if the provider lists it,
 *  else the provider's first model, so the default is always real. */
const PRESETS = [
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "cheap, steady, reachable from mainland China",
    keyUrl: "https://platform.deepseek.com/api_keys",
    model: "deepseek-chat",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    hint: "the strongest models for long analyses",
    keyUrl: "https://console.anthropic.com/settings/keys",
    model: "claude-sonnet-4-5",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "one key that unlocks many models",
    keyUrl: "https://openrouter.ai/settings/keys",
    model: "anthropic/claude-sonnet-4.5",
  },
] as const;

/**
 * First-run setup: the three steps between a fresh download and a working
 * workbench, in order, each with its live status — connect one model
 * provider, enable Stata (optional), run the two-minute demo. The audience
 * has never configured an AI tool; every step is one paste or one click,
 * and everything here writes through the same runtime config as Settings.
 */
export function SetupPage() {
  const t = useT();
  const navigate = useNavigate();
  const { status, loadCatalog } = useRuntimeStore();
  const connected = status === "ready";
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [stataOnDisk, setStataOnDisk] = useState<boolean | null>(null);

  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("deepseek");
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [installingStata, setInstallingStata] = useState(false);

  const refresh = useCallback(async () => {
    const client = getClient();
    if (!client) return;
    try {
      const provs = await client.listProviders();
      setProviders(provs);
      setMcpServers(await client.listMcpServers().catch(() => []));
      // A provider can be present (e.g. a key already in the environment) with
      // no default model chosen — then the composer has nothing to send with.
      // Pick the first real provider's first model so "connected" is true in
      // practice and the demo can run without a detour through Settings.
      const own = provs.filter((p) => p.id !== "opencode");
      const current = await client.getDefaultModel().catch(() => null);
      if (!current && own[0]?.models[0]) {
        await client.setDefaultModel(`${own[0].id}/${own[0].models[0].id}`);
        await loadCatalog(); // reflect the picked model in the sidebar chip
      }
    } catch {
      /* runtime not ready yet */
    }
  }, [loadCatalog]);

  useEffect(() => {
    if (connected) void refresh();
  }, [connected, refresh]);
  useEffect(() => {
    if (isTauri)
      void detectTools().then((tools) =>
        setStataOnDisk(tools.some((x) => x.name === "Stata" && x.found)),
      );
  }, []);

  // The built-in "opencode" entry is always present — a model is truly
  // connected only when the user added a provider of their own.
  const ownProviders = providers.filter((p) => p.id !== "opencode");
  const modelDone = ownProviders.length > 0;
  const stataDone = mcpServers.some((s) => s.name === "stata");

  const saveKey = async () => {
    const p = PRESETS.find((x) => x.id === preset)!;
    setSavingKey(true);
    try {
      const client = getClient()!;
      await client.setProviderApiKey(p.id, keyInput.trim());
      // Default to a model this provider actually serves, preferring the
      // preset's suggestion — the user should never have to pick one first.
      const fresh = await client.listProviders();
      const models = fresh.find((x) => x.id === p.id)?.models ?? [];
      const model = models.find((m) => m.id === p.model) ?? models[0];
      if (model) await client.setDefaultModel(`${p.id}/${model.id}`);
      setKeyInput("");
      setProviders(fresh);
      await loadCatalog(); // so the sidebar's model chip stops saying "not set"
      toast.success(`${p.label} ${t("connected — the model is ready.")}`);
    } catch (e) {
      toast.error(`${t("Could not save the key")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingKey(false);
    }
  };

  const enableStata = async () => {
    const c = SCIENCE_CONNECTORS.find((x) => x.id === "stata")!;
    setInstallingStata(true);
    try {
      toast.success(t("Setting up Stata — the first run downloads a managed Python, please wait…"));
      const python = await setupScienceMcp(c.pkg);
      await getClient()!.addMcpServer(c.id, connectorConfig(c, python));
      toast.success(t("Stata enabled — the agent can now run do-files."));
      await refresh();
    } catch (e) {
      toast.error(`${t("Stata setup failed:")} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setInstallingStata(false);
    }
  };

  const runDemo = () => {
    const demo = WORKFLOW_STARTERS.find((s) => s.id === "demo-quant")!;
    setComposerDraft(t(demo.prompt));
    navigate("/live");
  };

  const activePreset = PRESETS.find((x) => x.id === preset)!;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-8 pb-16 pt-10">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-muted">
          {t("Setup")}
        </div>
        <h1 className="mt-2 font-serif text-[26px] leading-tight text-text">
          {t("Three steps and the workbench is ready")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t(
            "No terminal, no config files. Connect one model, enable Stata if you have it, then run the demo to see the whole path work.",
          )}
        </p>

        {!connected && (
          <p className="mt-5 rounded-input border border-border bg-surface-2 px-3 py-2 text-[13px] text-muted">
            {t("Starting the built-in runtime — this page fills in as soon as it is up…")}
          </p>
        )}

        {/* ---- Step 1 · model ---- */}
        <Step
          n={1}
          done={modelDone}
          title={t("Connect a model")}
          doneNote={
            modelDone ? `${ownProviders.map((p) => p.name).join(" · ")} ${t("connected")}` : undefined
          }
        >
          <p className="text-[13px] leading-relaxed text-muted">
            {t(
              "The agent needs one AI model behind it. Pick a provider, get a key from its site (like registering an account), paste it here.",
            )}
          </p>
          <div className="mt-3 flex gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={cn(
                  "rounded-input border px-3 py-1.5 text-[13px] transition-colors",
                  preset === p.id
                    ? "border-accent/50 bg-accent/10 text-text"
                    : "border-border bg-surface text-muted hover:text-text",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">{t(activePreset.hint)}</p>
          <div className="mt-2.5 flex items-center gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={`${activePreset.label} API key`}
              className="h-9 min-w-0 flex-1 rounded-input border border-border bg-surface px-3 font-mono text-[13px] text-text outline-none placeholder:text-muted focus:border-accent/60"
            />
            <button
              onClick={() => void saveKey()}
              disabled={!connected || savingKey || !keyInput.trim()}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {savingKey ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {t("Save")}
            </button>
          </div>
          <button
            onClick={() => void openExternal(activePreset.keyUrl)}
            className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <ExternalLink size={11} /> {t("Get a key from")} {activePreset.label}
          </button>
          <p className="mt-2 text-xs text-muted">
            {t("Other providers, custom endpoints and local models live in")}{" "}
            <button className="text-accent hover:underline" onClick={() => navigate("/settings")}>
              {t("Settings")}
            </button>
            .
          </p>
        </Step>

        {/* ---- Step 2 · Stata ---- */}
        <Step
          n={2}
          done={stataDone}
          title={t("Enable Stata")}
          doneNote={stataDone ? t("Stata is connected — the agent can run do-files.") : undefined}
        >
          <p className="text-[13px] leading-relaxed text-muted">
            {t(
              "One click installs the Stata bridge into an isolated environment — nothing on your system is touched. Needs a licensed Stata already installed on this computer.",
            )}
          </p>
          {stataOnDisk !== null && (
            <p className={cn("mt-2 text-xs", stataOnDisk ? "text-ok" : "text-muted")}>
              {stataOnDisk
                ? t("Stata was detected on this computer.")
                : t("No Stata found on this computer — install Stata first, or skip this step; R and Python analyses work without it.")}
            </p>
          )}
          <button
            onClick={() => void enableStata()}
            disabled={!connected || installingStata}
            className="mt-3 flex h-9 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {installingStata ? (
              <>
                <Loader2 size={13} className="animate-spin" /> {t("Setting up…")}
              </>
            ) : (
              t("Enable Stata")
            )}
          </button>
        </Step>

        {/* ---- Step 3 · demo ---- */}
        <Step n={3} done={false} title={t("Run the two-minute demo")}>
          <p className="text-[13px] leading-relaxed text-muted">
            {t(
              "A regression demo on Stata's built-in auto data — it exercises the model, Stata and the results workbench in one pass. The message is pre-filled; you just press send.",
            )}
          </p>
          <button
            onClick={runDemo}
            disabled={!modelDone}
            title={!modelDone ? t("Connect a model first") : undefined}
            className="mt-3 flex h-9 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {t("Open the demo")}
          </button>
        </Step>
      </div>
    </div>
  );
}

function Step({
  n,
  done,
  title,
  doneNote,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  doneNote?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-card border border-border bg-surface shadow-card">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3">
        <span
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-full font-serif text-[15px]",
            done ? "bg-ok/15 text-ok" : "bg-surface-2 text-muted ring-1 ring-border",
          )}
        >
          {done ? <Check size={14} /> : n}
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-[15px] text-text">{title}</h2>
          {doneNote && <p className="truncate text-xs text-ok/90">{doneNote}</p>}
        </div>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
