import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, ExternalLink, Loader2 } from "lucide-react";
import type { McpServer, ProviderInfo } from "@fishes/sdk";
import { getClient, useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";
import {
  detectTools,
  isTauri,
  openExternal,
  pinStataCli,
  resetScienceMcpEnv,
  setupScienceMcp,
  testStataBridge,
  verifyProviderKey,
} from "@/lib/tauri";
import { StataDiagnosis } from "@/components/setup/StataDiagnosis";
import { PROVIDER_PRESETS as PRESETS, explainCheckError } from "@/lib/providerPresets";
import { openFeedback } from "@/lib/feedback";
import { SCIENCE_CONNECTORS, connectorConfig, stataEditionLabel } from "@/lib/scienceConnectors";
import { WORKFLOW_STARTERS } from "@/components/thread/WorkflowStarters";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";



/** Shared field styling for the custom-endpoint form (matches the key input). */
const CUSTOM_INPUT =
  "h-9 min-w-0 rounded-input border border-border bg-surface px-3 text-[15px] text-text outline-none placeholder:text-muted focus:border-accent/60";

/** The demo sent when Stata is not connected: a self-contained regression on
 *  the app's bundled Python, so a user who skipped the optional Stata step
 *  still gets a working first analysis (not a guaranteed-to-fail Stata run). */
const PYTHON_DEMO_PROMPT =
  "Run a quick analysis demo with Python (use the app's bundled uv/Python — install pandas and statsmodels if they are missing): build a small synthetic dataset of about 200 rows where an outcome depends on two predictors plus noise, fit an OLS regression with statsmodels, show me the coefficient table, and save the results as a .qreg file so I can open them in the results panel.";

/** Stata wiring, made visible: env+bridge install (long on first run — it
 *  downloads a managed Python), connector registration, live bridge test. */
type StataSetupPhase =
  | { step: "idle" }
  | { step: "installing" }
  | { step: "registering" }
  | { step: "testing" }
  | { step: "ok"; edition: string }
  | { step: "error"; message: string; detail: string };

/**
 * First-run setup: the three steps between a fresh download and a working
 * workbench, in order, each with its live status — connect one model
 * provider, enable Stata (optional), run the two-minute demo. The audience
 * has never configured an AI tool; every step is one paste or one click,
 * and everything here writes through the same runtime config as Settings.
 * On a fresh install SetupGate keeps the whole app on this page until step 1
 * passes its live check — so this page IS the first-run experience.
 */
export function SetupPage() {
  const t = useT();
  const navigate = useNavigate();
  const { status, loadCatalog } = useRuntimeStore();
  const connected = status === "ready";
  const setupNeeded = useRuntimeStore((s) => s.setupNeeded);
  const setSetupNeeded = useRuntimeStore((s) => s.setSetupNeeded);
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [stataOnDisk, setStataOnDisk] = useState<boolean | null>(null);

  // "custom" is the third door beside the presets: a self-hosted / compatible
  // endpoint (local Ollama, a lab gateway). Same form and config channel as
  // Settings, surfaced here so those users can finish setup without a detour.
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"] | "custom">("deepseek");
  const [keyInput, setKeyInput] = useState("");
  // Custom endpoint fields (mirrors the Settings form).
  const [cName, setCName] = useState("");
  const [cNpm, setCNpm] = useState("@ai-sdk/openai-compatible");
  const [cUrl, setCUrl] = useState("");
  const [cKey, setCKey] = useState("");
  const [cModels, setCModels] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  // The key is verified; the save is just waiting for the booting runtime.
  const [waitingForRuntime, setWaitingForRuntime] = useState(false);
  // Key failures pin an inline error under the field (what happened + how to
  // fix) — a toast vanishes before a first-time user has read it.
  const [keyError, setKeyError] = useState<{ message: string; detail: string } | null>(null);
  const [stataPhase, setStataPhase] = useState<StataSetupPhase>({ step: "idle" });
  // When wiring fails, the raw error is handed to OpenCode for a live, visible
  // diagnosis (streamed into the card). Null = no diagnosis running.
  const [diagnose, setDiagnose] = useState<string | null>(null);
  // Result-card state: step 1 collapses into "what is connected" once done;
  // "Change…" reopens the form. justVerified only claims a live check when
  // one actually ran in this session (an env-provided key was never tested).
  const [editingKey, setEditingKey] = useState(false);
  const [justVerified, setJustVerified] = useState(false);
  const defaultModel = useRuntimeStore((s) => s.defaultModel);
  const stataCardRef = useRef<HTMLDivElement>(null);

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
      // The first-run guard is released ONLY by an explicit act (a verified
      // key saved in saveKey, or SetupGate's live check) — never inferred
      // here from providers that merely exist.
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
    if (!isTauri) return;
    void detectTools().then((all) => {
      setStataOnDisk(all.some((x) => x.name === "Stata" && x.found));
    });
  }, []);

  // The built-in "opencode" entry is always present — a model is truly
  // connected only when the user added a provider of their own.
  const ownProviders = providers.filter((p) => p.id !== "opencode");
  const modelDone = ownProviders.length > 0;
  const stataDone = mcpServers.some((s) => s.name === "stata");

  const saveKey = async () => {
    const p = PRESETS.find((x) => x.id === preset)!;
    // Guideline: never pre-disable the primary button — an empty click
    // explains what is missing instead.
    if (!keyInput.trim()) {
      setKeyError({ message: "Paste the key first — the field above is still empty.", detail: "" });
      return;
    }
    setKeyError(null);
    setSavingKey(true);
    try {
      // Verify with a real request FIRST — only a working key gets saved, so
      // "connected" in the UI is a tested fact, not a stored string. This is a
      // direct HTTPS call to the provider; it does NOT need the built-in
      // runtime, so the user gets real feedback even during first boot.
      await verifyProviderKey(p.id, keyInput.trim());
      // Saving DOES need the runtime. On a first launch it can still be
      // booting (a minute or more) — wait for it and continue automatically,
      // exactly as the banner promises ("this page updates automatically").
      // Bouncing the user with "try again later" here contradicted that
      // banner (user-reported dead end).
      if (useRuntimeStore.getState().status !== "ready") {
        setWaitingForRuntime(true);
        // Generous: a first boot on a slow Windows machine (Defender scan +
        // the runtime's one-time package install) can take several minutes.
        const ready = await waitForRuntimeReady(300_000);
        setWaitingForRuntime(false);
        if (!ready) {
          setKeyError({
            message: "The workbench is still starting up — wait a moment and try again.",
            detail: "",
          });
          return;
        }
      }
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
      setSetupNeeded(false); // the guard releases the moment a verified key is saved
      setJustVerified(true);
      setEditingKey(false);
      await loadCatalog(); // so the sidebar's model chip stops saying "not set"
      toast.success(`${p.label} ${t("connected — the model is ready.")}`);
    } catch (e) {
      setKeyError(explainCheckError(e));
    } finally {
      setSavingKey(false);
    }
  };

  const saveCustomEndpoint = async () => {
    const name = cName.trim();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const models = cModels.split(",").map((s) => s.trim()).filter(Boolean);
    if (!id || !cUrl.trim() || models.length === 0) {
      setKeyError({ message: "Name, base URL and at least one model id are required.", detail: "" });
      return;
    }
    setKeyError(null);
    setSavingKey(true);
    try {
      // Unlike the presets there is no pre-flight check here — arbitrary
      // endpoints differ too much in shape to probe one URL reliably, and a
      // wrong guess would block a working endpoint. Saving needs the runtime,
      // so wait for it exactly the way saveKey does.
      if (useRuntimeStore.getState().status !== "ready") {
        setWaitingForRuntime(true);
        const ready = await waitForRuntimeReady(300_000);
        setWaitingForRuntime(false);
        if (!ready) {
          setKeyError({
            message: "The workbench is still starting up — wait a moment and try again.",
            detail: "",
          });
          return;
        }
      }
      const client = getClient()!;
      await client.addCustomProvider(id, {
        name,
        npm: cNpm,
        baseURL: cUrl.trim(),
        apiKey: cKey.trim() || undefined,
        models,
      });
      await client.setDefaultModel(`${id}/${models[0]}`);
      setProviders(await client.listProviders());
      setSetupNeeded(false); // adding an endpoint is the explicit act that releases the guard
      setJustVerified(false); // saved, not live-verified — the card must never claim a check ran
      setEditingKey(false);
      setCName("");
      setCUrl("");
      setCKey("");
      setCModels("");
      await loadCatalog();
      toast.success(`${name} ${t("connected — the model is ready.")}`);
    } catch (e) {
      setKeyError(explainCheckError(e));
    } finally {
      setSavingKey(false);
    }
  };

  const wireStataOnce = async (c: (typeof SCIENCE_CONNECTORS)[number]) => {
    setStataPhase({ step: "installing" });
    const python = await setupScienceMcp(c.pkg);
    setStataPhase({ step: "registering" });
    await getClient()!.addMcpServer(c.id, connectorConfig(c, python));
    setStataPhase({ step: "testing" });
    return stataEditionLabel(await testStataBridge(c.pkg));
  };

  // Poll the live runtime status (not the render-time `connected` snapshot).
  const waitForRuntimeReady = async (timeoutMs: number) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (useRuntimeStore.getState().status === "ready") return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return useRuntimeStore.getState().status === "ready";
  };

  const enableStata = async () => {
    setDiagnose(null);
    if (!connected) {
      // The runtime may still be finishing startup (or reconnecting right after
      // the model was set). Don't dead-end — show progress and wait for it,
      // then continue, so the user never sees an anonymous "try again".
      setStataPhase({ step: "installing" });
      if (!(await waitForRuntimeReady(45_000))) {
        setStataPhase({ step: "idle" });
        toast.error(t("The workbench is still starting up — wait a moment and try again."));
        return;
      }
    }
    // Steps are ordered for a reason: the failure path hands the raw error to
    // the connected model, so wiring Stata before a model exists would leave
    // failures unexplained. The button is disabled too — this guard backs it.
    if (!modelDone) {
      toast.error(t("Connect a model first"));
      return;
    }
    // Deliberately NO stataOnDisk gate here: the fast scan is a heuristic
    // (renamed folders, odd drives, repacks all evade it), and the bridge's
    // own finder does a much deeper search — the scan must never veto the
    // attempt by declaring "no Stata on this machine" (user-reported).
    const c = SCIENCE_CONNECTORS.find((x) => x.id === "stata")!;
    try {
      const edition = await wireStataOnce(c);
      setStataPhase({ step: "ok", edition });
      await refresh();
    } catch (first) {
      // Self-heal, silently: unless the failure is "no Stata on this machine"
      // (a clean env won't conjure one), throw the half-written env away and
      // rebuild once. The progress card just keeps running.
      let failure = first;
      if (!String(first).startsWith("stata_not_found")) {
        try {
          await resetScienceMcpEnv();
          const edition = await wireStataOnce(c);
          setStataPhase({ step: "ok", edition });
          await refresh();
          return;
        } catch (second) {
          failure = second;
        }
      }
      // Still stuck: show the generic message AND hand the raw failure to the
      // connected OpenCode agent for a live, visible diagnosis streamed into the
      // card (tool calls + conclusion) — the way the user works day to day.
      const { message, detail } = explainCheckError(failure);
      setStataPhase({ step: "error", message, detail });
      setDiagnose(String(failure));
    }
  };

  // Verify an already-enabled bridge (used by the auto-check on page load and
  // the Recheck action) — test only, never installs anything.
  // `withDiagnosis` is set by the user-clicked Recheck; the silent auto-check on
  // page load passes false so it never spawns an agent session on its own.
  const verifyStata = useCallback(async (withDiagnosis = false) => {
    const c = SCIENCE_CONNECTORS.find((x) => x.id === "stata")!;
    setDiagnose(null);
    setStataPhase({ step: "testing" });
    try {
      const edition = stataEditionLabel(await testStataBridge(c.pkg));
      setStataPhase({ step: "ok", edition });
    } catch (e) {
      const { message, detail } = explainCheckError(e);
      setStataPhase({ step: "error", message, detail });
      if (withDiagnosis) setDiagnose(String(e));
    }
  }, []);

  // The user's final say: pick the Stata program in a native dialog, pin it
  // through the bridge's own config, then re-test. The app never concludes
  // "no Stata" — it says "not found" and hands over the wheel.
  const [pickingStata, setPickingStata] = useState(false);
  const chooseStataManually = async () => {
    setPickingStata(true);
    try {
      const cli = await pinStataCli();
      if (cli === null) return; // dialog cancelled
      await verifyStata();
    } catch (e) {
      toast.error(t(explainCheckError(e).message));
    } finally {
      setPickingStata(false);
    }
  };

  // Called after OpenCode's fix session finishes: re-test the bridge. If the
  // repair took, flip the card to "connected" and drop the diagnosis panel; if
  // it is still broken, leave the panel (and OpenCode's guidance) in place.
  // Flip the card to connected the instant the bridge tests OK — shared by the
  // agent-fix hand-off (onDone) and the background poll below. Silent on failure:
  // the poll simply keeps watching, so there is never a false "failed".
  const tryConnectStata = useCallback(async (): Promise<boolean> => {
    const c = SCIENCE_CONNECTORS.find((x) => x.id === "stata")!;
    try {
      const edition = stataEditionLabel(await testStataBridge(c.pkg));
      setStataPhase({ step: "ok", edition });
      setDiagnose(null);
      await refresh();
      toast.success(t("Stata is connected — the agent can run do-files."));
      return true;
    } catch {
      return false;
    }
  }, [refresh, t]);

  // Fishes keeps checking until Stata connects — no manual re-check, no arbitrary
  // cap. While the bridge is registered-but-not-verified, poll; the card flips to
  // green the moment it works, whether Fishes just fixed it (env settling) or the
  // user installed Stata themselves. Polite about the true-negative machine: each
  // failed test on Windows ends in a full-drive search, so ticks never overlap
  // (a scan can outlast the interval) and the delay backs off from 3.5s toward
  // 60s. Leaving the page (unmount) or connecting stops it entirely.
  useEffect(() => {
    if (!isTauri || !stataDone || stataPhase.step === "ok" || stataPhase.step === "testing") return;
    let stop = false;
    let delay = 3500;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      const ok = await tryConnectStata();
      if (stop || ok) return;
      delay = Math.min(delay * 1.6, 60_000);
      timer = setTimeout(() => void tick(), delay);
    };
    timer = setTimeout(() => void tick(), delay);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [stataDone, stataPhase.step, tryConnectStata]);
  // Step 2's result card should state a fact, not a memory: when the bridge
  // is already registered, test it once so "connected" is verified-now.
  const stataChecked = useRef(false);
  useEffect(() => {
    if (!isTauri || !stataDone || stataChecked.current || stataPhase.step !== "idle") return;
    stataChecked.current = true;
    void verifyStata();
  }, [stataDone, stataPhase.step, verifyStata]);

  const runDemo = () => {
    if (!modelDone) {
      toast.error(t("Connect a model first"));
      return;
    }
    // The Stata demo (sysuse auto) can only run once the bridge is connected.
    // Without Stata, send a Python demo instead — it uses the app's bundled
    // Python, so a user who (correctly) skipped the optional Stata step still
    // gets a working first analysis rather than a guaranteed failure.
    if (stataDone) {
      const demo = WORKFLOW_STARTERS.find((s) => s.id === "demo-quant")!;
      setComposerDraft(t(demo.prompt));
    } else {
      setComposerDraft(t(PYTHON_DEMO_PROMPT));
    }
    navigate("/live");
  };

  // Null while the custom-endpoint door is selected — every use below branches.
  const activePreset = preset === "custom" ? null : PRESETS.find((x) => x.id === preset)!;
  // "DeepSeek · deepseek-chat" — the concrete fact both the guidance bar and
  // the step-1 result card show. defaultModel is "provider/model"; the model
  // part may itself contain slashes (openrouter), so split on the first only.
  const dmSlash = defaultModel?.indexOf("/") ?? -1;
  const dmProviderId = dmSlash > 0 ? defaultModel!.slice(0, dmSlash) : null;
  const dmModelId = dmSlash > 0 ? defaultModel!.slice(dmSlash + 1) : null;
  const dmProviderName = providers.find((p) => p.id === dmProviderId)?.name ?? dmProviderId;
  const modelLine = dmModelId ? `${dmProviderName} · ${dmModelId}` : (ownProviders[0]?.name ?? "");
  const modelOptions = ownProviders.flatMap((p) =>
    p.models.map((m) => ({ value: `${p.id}/${m.id}`, label: `${p.name} · ${m.id}` })),
  );
  const pickModel = async (value: string) => {
    try {
      await getClient()!.setDefaultModel(value);
      await loadCatalog(); // sidebar chip follows immediately
    } catch (e) {
      toast.error(t(explainCheckError(e).message));
    }
  };
  const wireStataFromBar = () => {
    stataCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    void enableStata();
  };
  const stataEdition = stataPhase.step === "ok" ? stataPhase.edition : null;
  const stataBusy =
    stataPhase.step === "installing" ||
    stataPhase.step === "registering" ||
    stataPhase.step === "testing";
  // How far the wiring has come: 0 installing → 1 registering → 2 testing → 3 done.
  const stataStage =
    stataPhase.step === "ok"
      ? 3
      : ["installing", "registering", "testing"].indexOf(stataPhase.step);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-8 pb-16 pt-10">
        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          {t("Setup")}
        </div>
        <h1 className="mt-2 font-serif text-[22px] leading-tight text-text">
          {t("Get started")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t(
            "Connect a model to start. Stata and the demo are optional — you can come back here any time.",
          )}
        </p>

        {!connected && (
          <p className="mt-5 rounded-input border border-border bg-surface-2 px-3 py-2 text-[15px] text-muted">
            {t("Setting up Fishes — the first launch takes about 2 minutes. This page updates automatically when it's ready.")}
          </p>
        )}

        {/* The guidance bar: one slot that always answers "what do I do now".
            ① no model → connect one. ② model + Stata on disk, not wired → ask
            whether they need it (need-based, never nags machines without
            Stata). ③ model, no Stata on disk → enter. ④ everything wired →
            enter. */}
        {setupNeeded === true && !modelDone && (
          <p className="mt-5 rounded-input border border-accent/30 bg-accent/5 px-3 py-2 text-[15px] leading-relaxed text-text">
            {t("To use the workbench, connect a model first.")}
          </p>
        )}
        {modelDone && stataOnDisk === true && !stataDone && (
          <div className="mt-5 rounded-input border border-accent/30 bg-accent/5 px-3 py-2.5">
            <p className="text-[15px] text-text">
              {t("Connected")}: {modelLine}
            </p>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">
              {t("Will you use Stata for analysis?")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={wireStataFromBar}
                disabled={stataBusy}
                className="flex h-8 items-center gap-1.5 rounded-input bg-accent px-3 text-[15px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t("Connect Stata (1–2 min)")}
              </button>
              <button
                onClick={() => navigate("/live")}
                className="flex h-8 items-center gap-1.5 rounded-input border border-border bg-surface px-3 text-[15px] text-text transition-colors hover:bg-surface-2"
              >
                {t("Not now — enter the workbench")} <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
        {modelDone && !stataEdition && !(stataOnDisk === true && !stataDone) && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-input border border-ok/30 bg-ok/5 px-3 py-2">
            <span className="min-w-0 text-[15px] text-text">
              {t("Connected")}: {modelLine}
              {stataOnDisk === false && (
                <span className="text-muted">
                  {" — "}
                  {t("R and Python analyses work out of the box; connect Stata here after installing it.")}
                </span>
              )}
            </span>
            <button
              onClick={() => navigate("/live")}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-input bg-accent px-3 text-[15px] font-medium text-accent-fg transition-opacity hover:opacity-90"
            >
              {t("Enter the workbench")} <ArrowRight size={13} />
            </button>
          </div>
        )}
        {/* "+ Stata" is a verified fact: it appears only after the bridge PASSED
            its live test this session — a registered-but-broken bridge must never
            put "Ready … + Stata" above a card still trying to connect. */}
        {modelDone && stataEdition && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-input border border-ok/30 bg-ok/5 px-3 py-2">
            <span className="min-w-0 truncate text-[15px] text-text">
              {t("Ready:")} {modelLine} + {stataEdition}
            </span>
            <button
              onClick={() => navigate("/live")}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-input bg-accent px-3 text-[15px] font-medium text-accent-fg transition-opacity hover:opacity-90"
            >
              {t("Enter the workbench")} <ArrowRight size={13} />
            </button>
          </div>
        )}

        {/* ---- Step 1 · model ---- */}
        <Step
          n={1}
          done={modelDone}
          title={t("Connect a model (required)")}
          doneNote={
            modelDone ? `${dmProviderName ?? ownProviders[0]?.name ?? ""} ${t("connected")}` : undefined
          }
        >
          {modelDone && !editingKey ? (
            <>
              {/* Result card: what exactly is connected, right where the form
                  was — plus the one thing worth adjusting here (the model). */}
              <p className="flex items-center gap-1.5 text-[15px] text-text">
                <Check size={14} className="shrink-0 text-ok" />
                {t("Connected")}: {modelLine}
              </p>
              {justVerified && (
                <p className="mt-1 text-xs text-muted">
                  {t("Verified with a live request when the key was saved.")}
                </p>
              )}
              {ownProviders.length > 1 && (
                <p className="mt-1 text-xs text-muted">
                  {t("Other providers with a key are also available — switch below.")}
                </p>
              )}
              {modelOptions.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <label className="shrink-0 text-[12px] text-muted" htmlFor="setup-model">
                    {t("Current model")}
                  </label>
                  <select
                    id="setup-model"
                    value={defaultModel ?? modelOptions[0]!.value}
                    onChange={(e) => void pickModel(e.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-input border border-border bg-surface px-2 text-[15px] text-text outline-none focus:border-accent/60"
                  >
                    {modelOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={() => setEditingKey(true)}
                className="mt-3 text-xs text-accent hover:underline"
              >
                {t("Change provider or API key…")}
              </button>
            </>
          ) : (
            <>
              <p className="text-[15px] leading-relaxed text-muted">
                {activePreset
                  ? t(
                      "Analysis runs on an AI model. Pick a provider, create an API key on its site, and paste it here.",
                    )
                  : t(
                      "Or point Fishes at your own endpoint — a local Ollama or any OpenAI/Anthropic-compatible service.",
                    )}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPreset(p.id);
                      setKeyError(null);
                    }}
                    className={cn(
                      "rounded-input border px-3 py-1.5 text-[15px] transition-colors",
                      preset === p.id
                        ? "border-accent/50 bg-accent/10 text-text"
                        : "border-border bg-surface text-muted hover:text-text",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setPreset("custom");
                    setKeyError(null);
                  }}
                  className={cn(
                    "rounded-input border px-3 py-1.5 text-[15px] transition-colors",
                    preset === "custom"
                      ? "border-accent/50 bg-accent/10 text-text"
                      : "border-border bg-surface text-muted hover:text-text",
                  )}
                >
                  {t("Custom endpoint")}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {activePreset
                  ? t(activePreset.hint)
                  : t("self-hosted · local Ollama · OpenAI/Anthropic-compatible")}
              </p>
              {activePreset ? (
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => {
                      setKeyInput(e.target.value);
                      if (keyError) setKeyError(null);
                    }}
                    placeholder={`${activePreset.label} API key`}
                    className="h-9 min-w-0 flex-1 rounded-input border border-border bg-surface px-3 font-mono text-[15px] text-text outline-none placeholder:text-muted focus:border-accent/60"
                  />
                  <button
                    onClick={() => void saveKey()}
                    disabled={savingKey}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[15px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {/* The button label stays SHORT — it is shrink-0, so a long
                        sentence here balloons the button and crushes the input
                        beside it (seen on Windows). The full explanation lives
                        on its own line below the row. */}
                    {savingKey ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {savingKey
                      ? waitingForRuntime
                        ? t("Setting up…")
                        : t("Testing the connection…")
                      : t("Save")}
                  </button>
                </div>
              ) : (
                <div className="mt-2.5 space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={cName}
                      onChange={(e) => {
                        setCName(e.target.value);
                        if (keyError) setKeyError(null);
                      }}
                      placeholder={t("Name — e.g. Ollama, My DeepSeek gateway")}
                      className={cn(CUSTOM_INPUT, "flex-1")}
                    />
                    <select
                      value={cNpm}
                      onChange={(e) => setCNpm(e.target.value)}
                      className={cn(CUSTOM_INPUT, "w-[150px] shrink-0")}
                    >
                      <option value="@ai-sdk/openai-compatible">{t("OpenAI-compatible")}</option>
                      <option value="@ai-sdk/anthropic">{t("Anthropic-compatible")}</option>
                    </select>
                  </div>
                  <input
                    value={cUrl}
                    onChange={(e) => {
                      setCUrl(e.target.value);
                      if (keyError) setKeyError(null);
                    }}
                    placeholder={t("Base URL — Ollama: http://127.0.0.1:11434/v1")}
                    className={cn(CUSTOM_INPUT, "w-full font-mono")}
                  />
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={cKey}
                      onChange={(e) => setCKey(e.target.value)}
                      placeholder={t("API key — optional, Ollama needs none")}
                      className={cn(CUSTOM_INPUT, "flex-1 font-mono")}
                    />
                    <input
                      value={cModels}
                      onChange={(e) => {
                        setCModels(e.target.value);
                        if (keyError) setKeyError(null);
                      }}
                      placeholder={t("Model ids, comma-separated")}
                      className={cn(CUSTOM_INPUT, "flex-1 font-mono")}
                    />
                  </div>
                  <button
                    onClick={() => void saveCustomEndpoint()}
                    disabled={savingKey}
                    className="flex h-9 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[15px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {savingKey ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {savingKey ? t("Setting up…") : t("Add endpoint")}
                  </button>
                </div>
              )}
              {/* The reassuring detail for the first-boot wait — its own line,
                  full width, instead of inflating the Save button. */}
              {waitingForRuntime && (
                <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-muted">
                  <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" />
                  {activePreset
                    ? t("Key verified — setting up Fishes (about 2 minutes), it saves automatically…")
                    : t("Waiting for the workbench to finish starting — the endpoint saves automatically…")}
                </p>
              )}
              {keyError && (
                <div className="mt-2 rounded-input border border-danger/30 bg-danger/5 px-3 py-2">
                  <p className="text-[15px] leading-relaxed text-danger">{t(keyError.message)}</p>
                  {keyError.detail && (
                    <p className="mt-1 break-all font-mono text-[12px] text-muted">{keyError.detail}</p>
                  )}
                </div>
              )}
              <div className="mt-2 flex items-center gap-3">
                {activePreset && (
                  <button
                    onClick={() => void openExternal(activePreset.keyUrl)}
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <ExternalLink size={11} /> {t("Get a key from")} {activePreset.label}
                  </button>
                )}
                {editingKey && (
                  <button
                    onClick={() => setEditingKey(false)}
                    className="text-xs text-muted hover:text-text"
                  >
                    {t("Cancel")}
                  </button>
                )}
              </div>
            </>
          )}
        </Step>

        {/* ---- Step 2 · Stata ---- */}
        <div ref={stataCardRef}>
        <Step
          n={2}
          // "Done" (green header) means the bridge actually PASSED its live test —
          // not merely that an MCP entry is registered. A registered-but-broken
          // bridge must never show "connected" over a red error.
          done={stataPhase.step === "ok"}
          title={t("Connect Stata (optional)")}
          doneNote={
            stataPhase.step === "ok" ? t("Stata is connected — the agent can run do-files.") : undefined
          }
          dimmed={!modelDone}
          hint={!modelDone ? t("Finish step 1 first") : undefined}
        >
          {stataDone ? (
            <>
              {/* Result card: verified now, not remembered — the page tests
                  the bridge on load and reports what it actually found. */}
              {stataPhase.step === "testing" && (
                <p className="flex items-center gap-2 text-[15px] text-muted">
                  <Loader2 size={13} className="animate-spin" /> {t("Testing the bridge…")}
                </p>
              )}
              {stataPhase.step === "ok" && (
                <>
                  <p className="flex items-center gap-1.5 text-[15px] text-text">
                    <Check size={14} className="shrink-0 text-ok" />
                    {t("Connected")}: {stataPhase.edition}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t("The bridge passed a live check in its isolated environment; the agent can run do-files.")}
                  </p>
                </>
              )}
              {/* The raw red error is superseded the moment Fishes starts fixing —
                  showing both a "fixing…" panel and a scary red error is the
                  contradiction the user flagged. */}
              {stataPhase.step === "error" && !diagnose && (
                <div className="rounded-input border border-danger/30 bg-danger/5 px-3 py-2">
                  <p className="text-[15px] leading-relaxed text-danger">{t(stataPhase.message)}</p>
                  {stataPhase.detail && (
                    <p className="mt-1 break-all font-mono text-[12px] text-muted">{stataPhase.detail}</p>
                  )}
                </div>
              )}
              {diagnose && <StataDiagnosis rawError={diagnose} onDone={() => void tryConnectStata()} />}
              {stataPhase.step !== "testing" && (
                <div className="mt-3 flex items-center gap-4">
                  <button
                    onClick={() => void verifyStata(true)}
                    className="text-xs text-accent hover:underline"
                  >
                    {t("Recheck")}
                  </button>
                  {stataPhase.step !== "ok" && (
                    <button
                      onClick={() => void chooseStataManually()}
                      disabled={pickingStata}
                      className="text-xs text-accent hover:underline disabled:opacity-50"
                    >
                      {t("Choose the Stata program manually…")}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-[15px] leading-relaxed text-muted">
                {t(
                  "One click installs the Stata bridge into an isolated environment — nothing on your system is touched. Needs a licensed Stata already installed on this computer.",
                )}
              </p>
              {/* Detection stays silent — any "found it" line reads as "already
                  done" to a non-technical user. Only absence is worth a word,
                  phrased as "the scan missed", never "you don't have Stata":
                  scans are heuristics and the connect flow searches deeper. */}
              {stataOnDisk === false && (
                <p className="mt-2 text-xs text-muted">
                  {t("The quick scan didn't spot Stata — it can miss custom installs. If Stata is on this machine, Connect Stata searches deeper; otherwise skip, R and Python analyses work without it.")}
                </p>
              )}
              <button
                onClick={() => void enableStata()}
                disabled={stataBusy || !modelDone}
                className="mt-3 flex h-9 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[15px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {stataBusy ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> {t("Setting up…")}
                  </>
                ) : stataPhase.step === "error" ? (
                  t("Retry")
                ) : (
                  t("Connect Stata")
                )}
              </button>
              {/* Show exactly where the wiring is instead of one anonymous
                  spinner. It uses the app's bundled Python (no download); only
                  the small Stata-bridge package is fetched. */}
              {stataPhase.step === "error" ? (
                <>
                  {/* Same rule: while Fishes is fixing, the panel replaces the red error. */}
                  {!diagnose && (
                    <div className="mt-3 rounded-input border border-danger/30 bg-danger/5 px-3 py-2">
                      <p className="text-[15px] leading-relaxed text-danger">{t(stataPhase.message)}</p>
                      {stataPhase.detail && (
                        <p className="mt-1 break-all font-mono text-[12px] text-muted">{stataPhase.detail}</p>
                      )}
                    </div>
                  )}
                  {diagnose && <StataDiagnosis rawError={diagnose} onDone={() => void tryConnectStata()} />}
                  {/* The escape hatch when every search came up empty: the user
                      knows where their Stata is — let them point at it. */}
                  <button
                    onClick={() => void chooseStataManually()}
                    disabled={pickingStata}
                    className="mt-2 block text-xs text-accent hover:underline disabled:opacity-50"
                  >
                    {t("Installed Stata but it wasn't found? Choose the Stata program manually…")}
                  </button>
                </>
              ) : (
                stataPhase.step !== "idle" && (
                  <div className="mt-3 space-y-2 rounded-input border border-border bg-surface-2/60 px-3 py-2.5">
                    <PhaseRow
                      state={stataStage > 0 ? "done" : "active"}
                      label={t(
                        "Installing the Stata bridge into an isolated environment (uses the app's own Python — no separate download)…",
                      )}
                    />
                    <PhaseRow
                      state={stataStage > 1 ? "done" : stataStage === 1 ? "active" : "pending"}
                      label={t("Registering the connector…")}
                    />
                    <PhaseRow
                      state={stataStage > 2 ? "done" : stataStage === 2 ? "active" : "pending"}
                      label={t("Testing the bridge…")}
                    />
                  </div>
                )
              )}
            </>
          )}
        </Step>
        </div>

        {/* ---- Step 3 · open a project (the working model) ---- */}
        <Step
          n={3}
          done={false}
          title={t("Open a project to work in")}
          dimmed={!modelDone}
          hint={!modelDone ? t("Finish step 1 first") : undefined}
        >
          <p className="text-[15px] leading-relaxed text-muted">
            {t(
              "Fishes works like a code editor: you open ONE project folder, and everything for that study — its literature, data, notebooks, and conversations — lives inside it, kept apart from your other projects.",
            )}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {t(
              "When you enter the app, it asks you to open a project: create a new one (give it a name), or open a folder where your materials already live. Pick one and start working — that folder is your workspace until you switch projects from the top-left.",
            )}
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-muted/80">
            {t("Just want to try it first? You can also run a quick demo:")}
          </p>
          <button
            onClick={runDemo}
            disabled={!modelDone}
            className="mt-2 flex h-9 items-center gap-1.5 rounded-input border border-border bg-surface-2 px-3.5 text-[15px] font-medium text-text transition-opacity hover:bg-surface disabled:opacity-50"
          >
            {t("Open the demo")}
          </button>
        </Step>

        {/* ---- Stuck? one obvious way out. ---- */}
        <p className="mt-6 text-center text-[15px] text-muted">
          {t("Ran into a problem?")}{" "}
          <button className="text-accent hover:underline" onClick={() => void openFeedback()}>
            {t("Report a problem")}
          </button>
        </p>
      </div>
    </div>
  );
}

function PhaseRow({ state, label }: { state: "done" | "active" | "pending"; label: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 text-[15px] leading-snug",
        state === "pending" ? "text-muted/60" : state === "active" ? "text-text" : "text-muted",
      )}
    >
      {state === "done" ? (
        <Check size={13} className="mt-0.5 shrink-0 text-ok" />
      ) : state === "active" ? (
        <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-accent" />
      ) : (
        <span className="mx-[3px] mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
      )}
      <span>{label}</span>
    </div>
  );
}

function Step({
  n,
  done,
  title,
  doneNote,
  dimmed,
  hint,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  doneNote?: string;
  /** Visually recede while an earlier required step is unfinished — still
   *  readable and clickable (buttons explain themselves), just not the focus. */
  dimmed?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "mt-6 rounded-card border border-border bg-surface shadow-card transition-opacity",
        dimmed && "opacity-55",
      )}
    >
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
        {hint && <span className="ml-auto shrink-0 text-xs text-muted">{hint}</span>}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
