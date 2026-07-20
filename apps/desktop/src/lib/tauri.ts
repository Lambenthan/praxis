// Thin bridge to the Tauri Rust side. In a plain browser these are no-ops so the
// app still runs in `pnpm dev`; in the packaged desktop app they invoke Rust commands.

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface OpenCodeCredentials {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export type ConfigureResult =
  | { ok: true; path: string }
  | { ok: false; reason: "not-desktop" }
  | { ok: false; reason: "error"; message: string };

/** Start the bundled OpenCode sidecar (desktop only). Returns its base URL. */
export async function startRuntime(): Promise<string | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("start_runtime");
}

/**
 * Per-run password the sidecar requires on every request (desktop only —
 * browser dev talks to a user-run, passwordless `opencode serve`). Held in
 * memory on both sides; never persisted.
 */
export async function runtimePassword(): Promise<string | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("runtime_password");
}

/**
 * Whether a saved provider key exists on DISK (the app-private auth.json) —
 * a filesystem fact the first-run gate can read the moment the window opens,
 * long before the sidecar is up. Corrects a stale localStorage "setup done"
 * flag after an app-data wipe: disk truth over webview memory.
 */
export async function setupCompletedOnDisk(): Promise<boolean> {
  if (!isTauri) return true;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("setup_completed_on_disk");
}

/**
 * Pick local files via the native dialog and copy them into the agent
 * workspace (desktop only). Returns the workspace file names; [] on cancel.
 */
export async function addFilesToWorkspace(): Promise<string[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("add_files_to_workspace");
}

/**
 * Write text into the workspace as a file (desktop only), deduplicating the
 * name on collision. Returns the actual file name written.
 */
export async function addTextToWorkspace(filename: string, content: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("add_text_to_workspace", { filename, content });
}

/**
 * Explicitly import the user's OpenCode CLI login into the app's private
 * runtime (desktop only). Returns false when no CLI login exists; the sidecar
 * is restarted on success.
 */
export async function importOpenCodeLogin(): Promise<boolean> {
  if (!isTauri) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("import_opencode_login");
}

/** How agent actions get approved — the composer's Codex-style switch.
 *  "approve": dangerous shell commands (delete / install / remote / privilege)
 *  and web fetches prompt first. "full": everything in-workspace just runs. */
export type ApprovalMode = "approve" | "full";

/** The approval mode OpenCode's config currently holds ("approve" until changed). */
export async function getApprovalMode(): Promise<ApprovalMode> {
  if (!isTauri) return "approve";
  const { invoke } = await import("@tauri-apps/api/core");
  const mode = await invoke<string>("get_approval_mode");
  return mode === "full" ? "full" : "approve";
}

/** Switch the approval mode; the sidecar restarts — the caller must reconnect. */
export async function setApprovalMode(mode: ApprovalMode): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_approval_mode", { mode });
}

/** Remove a provider/mcp entry from the global OpenCode config (restarts the sidecar). */
export async function removeConfigEntry(section: "provider" | "mcp", key: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("remove_config_entry", { section, key });
}

/** Bundled skills the user has disabled (profile skill directory names). Empty
 *  in browser dev, where the profile is not managed by the desktop shell. */
export async function listDisabledSkills(): Promise<string[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("list_disabled_skills");
}

/** Enable/disable a bundled skill by its profile directory name. Disabling
 *  removes the skill from the runtime so the agent can no longer load it; the
 *  sidecar restarts either way, so the caller must reconnect. */
export async function setSkillDisabled(name: string, disabled: boolean): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_skill_disabled", { name, disabled });
}

export interface JupyterStatus {
  installed: boolean;
  running: boolean;
  url: string | null;
  token: string | null;
  mcp_command: string | null;
}

/** State of the app-managed Jupyter environment (desktop only). */
export async function jupyterStatus(): Promise<JupyterStatus | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<JupyterStatus>("jupyter_status");
}

/** Provision the isolated Jupyter env via bundled uv (first run: minutes, ~hundreds of MB). */
export async function setupJupyter(): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("setup_jupyter");
}

/** Start the managed headless jupyter-lab (idempotent). */
export async function startJupyter(): Promise<JupyterStatus> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<JupyterStatus>("start_jupyter");
}

/** Managed interpreter path for the shared science-MCP env, or null if not yet
 *  provisioned (desktop only). */
export async function scienceMcpPython(): Promise<string | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("science_mcp_python");
}

/** Provision one open-source MCP pip package into the shared isolated env and
 *  return the managed Python path to launch it with (desktop only). */
export async function setupScienceMcp(pkg: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("setup_science_mcp", { package: pkg });
}

/** The user's final say on where Stata lives: a native picker chooses the
 *  Stata program (or .app bundle on macOS), which gets pinned into the
 *  bridge's own config. Resolves to the pinned CLI path, or null on cancel —
 *  the caller re-tests the bridge afterwards. */
export async function pinStataCli(): Promise<string | null> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("pin_stata_cli");
}

/** Delete the shared isolated env so the next setup starts clean — the silent
 *  self-heal for a half-written env (interrupted download, broken install). */
export async function resetScienceMcpEnv(): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<void>("reset_science_mcp_env");
}

/** Make one real request with a pasted API key so "connected" is a verified
 *  fact, not a saved string. Rejects with "<code>: detail" where code is
 *  invalid_key | no_balance | rate_limited | network | provider_error —
 *  translate the code, show the detail small. */
export async function verifyProviderKey(provider: string, key: string): Promise<void> {
  if (!isTauri) return; // browser dev: nothing to verify against
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<void>("verify_provider_key", { provider, key });
}

/** Post-enable Stata check: isolated env exists, bridge package installed,
 *  Stata found on disk. Resolves to the detected edition string; rejects with
 *  "<code>: detail" (bridge_env_missing | bridge_import | stata_not_found). */
export async function testStataBridge(pkg: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("test_stata_bridge", { package: pkg });
}

/** Auto-start Jupyter on launch when it was enabled before. Silent no-op otherwise. */
export async function ensureJupyter(): Promise<void> {
  try {
    const s = await jupyterStatus();
    if (s?.installed && !s.running) await startJupyter();
  } catch {
    /* Jupyter is optional — never block the app on it */
  }
}

/** Open an http(s) URL in the system browser (never navigates the webview). */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (isTauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_url", { url });
    } catch {
      /* opening a link must never break the app */
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export type SaveResult =
  | { kind: "saved"; path: string }
  | { kind: "canceled" }
  | { kind: "not-desktop" };

/** Save text via the native "Save As" dialog (desktop only). Throws on write failure. */
export async function saveTextFile(filename: string, content: string): Promise<SaveResult> {
  if (!isTauri) return { kind: "not-desktop" };
  const { invoke } = await import("@tauri-apps/api/core");
  const path = await invoke<string | null>("save_text_file", { filename, content });
  return path ? { kind: "saved", path } : { kind: "canceled" };
}

/** Save raw bytes via the native "Save As" dialog (desktop only) — for binary
 *  artifacts like a .docx. Bytes cross the bridge as a plain number array. */
export async function saveBinaryFile(filename: string, content: Uint8Array): Promise<SaveResult> {
  if (!isTauri) return { kind: "not-desktop" };
  const { invoke } = await import("@tauri-apps/api/core");
  const path = await invoke<string | null>("save_binary_file", {
    filename,
    content: Array.from(content),
  });
  return path ? { kind: "saved", path } : { kind: "canceled" };
}

/** The active workspace directory (desktop only; null in browser). */
export async function workspacePath(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("workspace_path");
  } catch {
    return null;
  }
}

/** The base folder new dated workspaces are created under (desktop only). */
export async function workspaceBase(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("workspace_base");
  } catch {
    return null;
  }
}

/** Choose the base folder new session workspaces are created under.
 *  Returns the canonical path. Throws in the browser. */
export async function setWorkspaceBase(path: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("set_workspace_base", { path });
}

/** Reveal the base workspace folder in the OS file manager. */
export async function openWorkspaceBase(): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_workspace_base");
}

/** Switch the active workspace folder (creates it if needed; the runtime
 *  rescopes via `?directory=` — no restart). Returns the canonical path.
 *  Throws in the browser. */
export async function setWorkspace(path: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("set_workspace", { path });
}

/** Create a new dated folder under the base workspace and switch to it. */
export async function newDatedWorkspace(name: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("new_dated_workspace", { name });
}

/** Whether an absolute path exists as a directory (false in the browser). */
export async function dirExists(path: string): Promise<boolean> {
  if (!isTauri) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("dir_exists", { path });
}

/** Native folder picker; null on cancel or in the browser. */
export async function pickFolder(): Promise<string | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("pick_folder");
}

/** Whether the China mirror set (npmmirror/TUNA) is active for uv/pip. */
export async function chinaMirrorsActive(): Promise<boolean> {
  if (!isTauri) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("china_mirrors_active");
}

export interface ToolStatus {
  name: string;
  found: boolean;
  version?: string | null;
}

/** Detect scientific/runtime tools on the user's system (desktop only). */
export async function detectTools(): Promise<ToolStatus[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ToolStatus[]>("detect_tools");
}

export interface HpcCheck {
  reachable: boolean;
  slurm: string | null;
  message: string | null;
}

export interface HpcJob {
  id: string;
  state: string;
  time: string;
  partition: string;
  name: string;
}

/** Host aliases from the user's ~/.ssh/config (desktop only). */
export async function listSshHosts(): Promise<string[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("list_ssh_hosts");
}

/** The configured cluster host, or null (desktop only). */
export async function hpcConfig(): Promise<string | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("hpc_config");
}

/** Persist (or clear, with null) the cluster host — shared with the agent via
 *  the workspace's .openscience/hpc.json. */
export async function setHpcConfig(host: string | null): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_hpc_config", { host });
}

/** Probe a host over SSH: reachable? Slurm available? */
export async function hpcCheck(host: string): Promise<HpcCheck> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<HpcCheck>("hpc_check", { host });
}

/** The user's queued/running Slurm jobs on the host. */
export async function hpcJobs(host: string): Promise<HpcJob[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<HpcJob[]>("hpc_jobs", { host });
}

/** Cancel one of the user's Slurm jobs. */
export async function hpcCancel(host: string, jobId: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("hpc_cancel", { host, jobId });
}

export interface ModalStatus {
  installed: boolean;
  version: string | null;
  authenticated: boolean;
  hint: string | null;
}

/** Detect whether the user's Modal CLI is installed and authenticated. */
export async function modalStatus(): Promise<ModalStatus | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ModalStatus>("modal_status");
}

/** Copy a bundled example project into the workspace (idempotent; never
 *  overwrites user edits). Returns the workspace directory name. */
export async function installExample(name: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("install_example", { name });
}

/** Append a diagnostic line to <app-data>/debug.log (desktop only; no-op in browser). */
export async function logDebug(message: string): Promise<void> {
  if (!isTauri) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("log_debug", { message });
  } catch {
    /* never let diagnostics break the app */
  }
}

/** Write the provider key/model into OpenCode's config via the Rust command. */
export async function configureOpenCode(
  creds: OpenCodeCredentials,
): Promise<ConfigureResult> {
  if (!isTauri) return { ok: false, reason: "not-desktop" };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const path = await invoke<string>("configure_opencode", {
      provider: creds.provider,
      apiKey: creds.apiKey,
      model: creds.model,
      baseUrl: creds.baseUrl ?? null,
    });
    return { ok: true, path };
  } catch (e) {
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
