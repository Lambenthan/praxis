// Manages the bundled OpenCode sidecar so it never interferes with any OpenCode
// the user already has: it runs the *bundled* binary, on a *dedicated free port*,
// with an *app-private* XDG config/data dir, and is killed on app exit.
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

use crate::opencode_config::merge_config;

/// Tested Stata JSON dumper, compiled into the binary and seeded into every
/// workspace root by `set_workspace`. Keeping the fragile `file write` code in
/// one vetted file (not model output) is what stops the agent from re-inventing
/// it and looping on r(198). Source of truth lives beside the stata-analyze skill.
const QDUMP_DO: &str = include_str!("../../../../runtime/skills/core/stata-analyze/_qdump.do");

#[derive(Default)]
pub struct RuntimeState {
    child: Mutex<Option<CommandChild>>,
    url: Mutex<Option<String>>,
    port: Mutex<Option<u16>>,
}

/// App-private runtime root, e.g. ~/Library/Application Support/com.fishes.app/runtime
fn runtime_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("runtime"))
}

fn xdg_config_home(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("xdg-config"))
}

/// File recording the user's chosen active workspace folder (absolute path).
fn active_workspace_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("active-workspace.txt"))
}

/// File recording the user's chosen BASE folder — the parent every new dated
/// session workspace is created under (Settings → Workspace).
fn base_workspace_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("base-workspace.txt"))
}

/// File recording which bundled skills the user disabled (one profile skill
/// directory name per line). Persisted in the runtime root — not the workspace
/// — so the choice follows the install, not a project.
fn disabled_skills_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(runtime_root(app)?.join("disabled-skills.txt"))
}

/// Skill directory names the user has disabled. A disabled skill's directory is
/// removed from the profile skills dir on every sidecar start (see
/// `deploy_bundled_skills`), so OpenCode never registers it — the agent can no
/// longer see or load it. Names are directory names (a single path segment);
/// anything containing a separator is ignored as a safety backstop.
fn read_disabled_skills(app: &AppHandle) -> Vec<String> {
    let Ok(path) = disabled_skills_file(app) else {
        return Vec::new();
    };
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    text.lines()
        .map(str::trim)
        .filter(|n| !n.is_empty() && !n.contains('/') && !n.contains('\\') && !n.contains(".."))
        .map(str::to_string)
        .collect()
}

/// The active workspace folder OpenCode / the kernel / previews / provenance all
/// operate in. Defaults to the base folder (`~/Fishes`) until the user opens or
/// creates another one; the choice persists across restarts.
pub fn workspace_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(f) = active_workspace_file(app) {
        if let Ok(s) = std::fs::read_to_string(&f) {
            let dir = PathBuf::from(s.trim());
            if dir.is_dir() {
                return Ok(dir);
            }
        }
    }
    base_workspace_dir(app)
}

/// The workspace root new project folders are created under. A folder the user
/// picked in Settings wins; the default is `~/Fishes` — the HOME ROOT, NOT
/// `~/Desktop`. This is deliberate and load-bearing on macOS: Desktop (and
/// Documents/Downloads) are TCC privacy-gated, so an app without that
/// permission — every fresh, unsigned, or not-yet-granted install — HANGS in
/// `getcwd()` the moment the agent runtime is spawned with its cwd there, and
/// the whole app is stuck "connecting" forever. The home root is not gated, so
/// the runtime starts on first launch with no prompt. It is still one obvious
/// visible folder, and it also avoids syncing a data-heavy workspace into
/// iCloud Desktop. Falls back to `$HOME` / `%USERPROFILE%`.
pub fn base_workspace_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(f) = base_workspace_file(app) {
        if let Ok(s) = std::fs::read_to_string(&f) {
            let dir = PathBuf::from(s.trim());
            if dir.is_dir() {
                return Ok(dir);
            }
        }
    }
    let home = app
        .path()
        .home_dir()
        .ok()
        .or_else(|| {
            std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .ok()
                .map(PathBuf::from)
        })
        .ok_or_else(|| "could not resolve a home directory".to_string())?;
    let dir = home.join("Fishes");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// One-time migration from the pre-rename **Praxis** install (bundle id
/// `com.praxis.app`, home root `~/Praxis`). Runs at startup BEFORE anything
/// reads the data dir. Every step is idempotent: it fires only when the old
/// artifact exists and the new one does not, so a fresh Fishes install and an
/// already-migrated one both no-op. The literals are hardcoded on purpose — the
/// whole point is to reach the *old* names.
pub fn migrate_from_praxis(app: &AppHandle) {
    // 1. App-private data dir: <support>/com.praxis.app → <support>/com.fishes.app
    //    (OpenCode profile, settings, science-mcp env, workspace pointers).
    if let Ok(new_data) = app.path().app_data_dir() {
        if let Some(parent) = new_data.parent() {
            migrate_dir(&parent.join("com.praxis.app"), &new_data);
        }
    }

    // 2. Default library / workspace home root: ~/Praxis → ~/Fishes. Only the
    //    DEFAULT root is moved; a user who picked a custom base folder kept it in
    //    base-workspace.txt (migrated in step 1) and is left alone.
    let home = app.path().home_dir().ok().or_else(|| {
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .ok()
            .map(PathBuf::from)
    });
    if let Some(home) = home {
        let old_root = home.join("Praxis");
        let new_root = home.join("Fishes");
        migrate_dir(&old_root, &new_root);
        // 3. Repoint stored workspace paths that lived under the old root, so the
        //    app reopens the exact same session folder instead of silently
        //    falling back to the base root. Runs after step 1, so these files are
        //    already in the new data dir.
        let files: Vec<PathBuf> = [active_workspace_file(app), base_workspace_file(app)]
            .into_iter()
            .flatten()
            .collect();
        repoint_workspace_files(&files, &old_root, &new_root);
    }
}

/// Rename `old` → `new` only when `old` is a dir and `new` does not yet exist.
/// A same-volume rename is atomic and cheap; anything else (new already there,
/// or a failed rename) is left untouched rather than risking a half-copy. This
/// is the idempotency guarantee: a fresh install and an already-migrated one
/// both no-op. Returns whether it moved anything.
fn migrate_dir(old: &Path, new: &Path) -> bool {
    if old.is_dir() && !new.exists() {
        return std::fs::rename(old, new).is_ok();
    }
    false
}

/// Rewrite any stored absolute path that began under `old_root` to sit under
/// `new_root` instead, in each of the given pointer files.
fn repoint_workspace_files(files: &[PathBuf], old_root: &Path, new_root: &Path) {
    let old_prefix = old_root.to_string_lossy();
    let new_prefix = new_root.to_string_lossy();
    for path in files {
        if let Ok(s) = std::fs::read_to_string(path) {
            if s.contains(old_prefix.as_ref()) {
                let _ = std::fs::write(path, s.replace(old_prefix.as_ref(), new_prefix.as_ref()));
            }
        }
    }
}

/// Path OpenCode reads when XDG_CONFIG_HOME points at our private dir.
fn opencode_config_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(xdg_config_home(app)?.join("opencode").join("opencode.json"))
}

/// The config file to edit in place: the server may have rewritten the config
/// as opencode.jsonc — prefer whichever exists, fall back to opencode.json.
fn effective_config_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = xdg_config_home(app)?.join("opencode");
    Ok(["opencode.jsonc", "opencode.json"]
        .iter()
        .map(|n| dir.join(n))
        .find(|p| p.exists())
        .unwrap_or_else(|| dir.join("opencode.json")))
}

/// The user's existing OpenCode auth file (their login / free credits), if any.
/// Read-only: we copy it into our sandbox so the bundled runtime can use the same
/// login, but we never modify the user's file or sessions.
fn user_auth_source() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        if !xdg.is_empty() {
            candidates.push(PathBuf::from(xdg).join("opencode").join("auth.json"));
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        candidates.push(PathBuf::from(&home).join(".local/share/opencode/auth.json"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        candidates.push(PathBuf::from(appdata).join("opencode").join("auth.json"));
    }
    candidates.into_iter().find(|p| p.exists())
}

/// Copy the user's OpenCode CLI login into the app-private data dir, EXPLICITLY
/// (from the Settings page) — never silently. Returns false when there is no
/// CLI login to import. Restarts the sidecar so it picks the credentials up.
#[tauri::command(async)]
pub fn import_opencode_login(app: AppHandle, state: State<'_, RuntimeState>) -> Result<bool, String> {
    let Some(src) = user_auth_source() else {
        return Ok(false);
    };
    let dst = runtime_root(&app)?.join("xdg-data").join("opencode").join("auth.json");
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dst).map_err(|e| format!("copy failed: {e}"))?;

    // Restart the running sidecar so /config/providers reflects the login.
    if state.url.lock().unwrap().is_some() {
        restart_sidecar(&app, &state)?;
    }
    Ok(true)
}

/// Deploy the bundled skill packs (Tauri resources) into the app-private
/// profile's global skills dir (`<xdg-config>/opencode/skills/`), which OpenCode
/// scans regardless of project detection: `skills/` is the external ai4s-skills
/// pack, `skills-office/` Anthropic's document skills (docx/pdf/pptx/xlsx),
/// `skills-core/` the first-party skills from `runtime/skills/core`. The
/// workspace's own `.opencode/skills/` stays reserved for skills the user
/// installs. Runs before every sidecar start so app upgrades refresh the packs.
///
/// A manifest (`.fishes-deployed`) records what this app deployed, so a skill
/// REMOVED from the bundle is also removed from the profile on the next start
/// — without it, retired skills (e.g. the upstream ai4s-agent) would linger on
/// every machine that ever installed them. Only names in the previous manifest
/// are ever deleted; anything the user put here by hand is never touched.
fn deploy_bundled_skills(app: &AppHandle) {
    let dst = match xdg_config_home(app) {
        Ok(cfg) => cfg.join("opencode").join("skills"),
        Err(_) => return,
    };
    let mut deployed: Vec<String> = Vec::new();
    for resource in ["skills", "skills-office", "skills-core"] {
        let src = match app
            .path()
            .resolve(resource, tauri::path::BaseDirectory::Resource)
        {
            Ok(p) if p.is_dir() => p,
            _ => continue, // dev run without `fetch-skills.sh` — nothing to deploy
        };
        match sync_skill_pack(&src, &dst) {
            Ok(names) => deployed.extend(names),
            Err(e) => eprintln!("failed to deploy bundled skills ({resource}): {e}"),
        }
    }
    prune_retired(&dst, &deployed);
    // Apply the user's per-skill disable choices: remove each disabled skill's
    // directory so OpenCode does not register it this run. Done AFTER deploy +
    // prune (which just re-added it) — the manifest still records it as deployed,
    // so prune never mistakes it for a retired skill. A restart re-runs this,
    // keeping the choice sticky across launches.
    for name in read_disabled_skills(app) {
        let _ = std::fs::remove_dir_all(dst.join(&name));
    }
}

/// Remove profile dirs that a previous deploy put there but the current bundle
/// no longer ships, then write the manifest for next time. Deletes ONLY names
/// listed in the previous manifest — user-added dirs are never candidates.
fn prune_retired(dst: &Path, deployed: &[String]) {
    let manifest = dst.join(".fishes-deployed");
    if let Ok(prev) = std::fs::read_to_string(&manifest) {
        for name in prev.lines().map(str::trim).filter(|n| !n.is_empty()) {
            if !deployed.iter().any(|d| d == name) {
                let _ = std::fs::remove_dir_all(dst.join(name));
            }
        }
    }
    if !deployed.is_empty() {
        let _ = std::fs::write(&manifest, deployed.join("\n"));
    }
}

/// Deploy the bundled agent definitions (`runtime/agents/*.md`) into the
/// profile's global agent dir (`<xdg-config>/opencode/agent/`) — OpenCode's
/// native markdown-agent format (frontmatter + system prompt). Same-named
/// files are replaced so app upgrades win; agents the user added stay.
fn deploy_bundled_agents(app: &AppHandle) {
    let dst = match xdg_config_home(app) {
        Ok(cfg) => cfg.join("opencode").join("agent"),
        Err(_) => return,
    };
    let src = match app
        .path()
        .resolve("agents", tauri::path::BaseDirectory::Resource)
    {
        Ok(p) if p.is_dir() => p,
        _ => return, // dev run without the resource — nothing to deploy
    };
    if let Err(e) = sync_agent_files(&src, &dst) {
        eprintln!("failed to deploy bundled agents: {e}");
    }
}

fn sync_agent_files(src: &Path, dst: &Path) -> std::io::Result<()> {
    sync_flat_files(src, dst, ".md")
}

/// Deploy the bundled OpenCode plugins (`runtime/plugins/*.js`) into the
/// profile's global plugin dir (`<xdg-config>/opencode/plugin/`) — the
/// hard-gate layer (research guardrails) that enforces in code what the
/// navigator's prompt asks for. Same replace-on-upgrade semantics as agents.
fn deploy_bundled_plugins(app: &AppHandle) {
    let dst = match xdg_config_home(app) {
        Ok(cfg) => cfg.join("opencode").join("plugin"),
        Err(_) => return,
    };
    let src = match app
        .path()
        .resolve("plugins", tauri::path::BaseDirectory::Resource)
    {
        Ok(p) if p.is_dir() => p,
        _ => return,
    };
    if let Err(e) = sync_flat_files(&src, &dst, ".js") {
        eprintln!("failed to deploy bundled plugins: {e}");
    }
}

/// Deploy the bundled global rules (`runtime/rules/AGENTS.md`) as the
/// profile's global `<xdg-config>/opencode/AGENTS.md` — the results-as-files
/// contract every session gets in its system prompt, regardless of which
/// skills the model chooses to load. Replaced on every start so upgrades win.
fn deploy_bundled_rules(app: &AppHandle) {
    let dst = match xdg_config_home(app) {
        Ok(cfg) => cfg.join("opencode").join("AGENTS.md"),
        Err(_) => return,
    };
    let src = match app
        .path()
        .resolve("rules/AGENTS.md", tauri::path::BaseDirectory::Resource)
    {
        Ok(p) if p.is_file() => p,
        _ => return,
    };
    if let Some(parent) = dst.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Err(e) = std::fs::copy(&src, &dst) {
        eprintln!("failed to deploy bundled rules: {e}");
    }
}

fn sync_flat_files(src: &Path, dst: &Path, ext: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        if entry.file_type()?.is_file() && name.to_string_lossy().ends_with(ext) {
            std::fs::copy(entry.path(), dst.join(name))?;
        }
    }
    Ok(())
}

/// Copy every skill directory under `src` into `dst`, replacing same-named
/// directories (so bundled updates win) and leaving everything else in `dst`
/// alone (user-installed skills keep their own directories). Directories
/// without a SKILL.md (placeholders) are skipped.
fn sync_skill_pack(src: &Path, dst: &Path) -> std::io::Result<Vec<String>> {
    std::fs::create_dir_all(dst)?;
    let mut names = Vec::new();
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() || !entry.path().join("SKILL.md").is_file() {
            continue;
        }
        let target = dst.join(entry.file_name());
        if target.exists() {
            std::fs::remove_dir_all(&target)?;
        }
        copy_dir(&entry.path(), &target)?;
        names.push(entry.file_name().to_string_lossy().to_string());
    }
    Ok(names)
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

/// PATH for the sidecar (and everything the agent runs through it). Apps
/// launched from Finder/Dock get a minimal PATH (`/usr/bin:/bin:…`), so the
/// agent would not find the user's Python/conda/Homebrew tools. Prepend the
/// well-known scientific tool locations that actually exist on this machine —
/// the same order a terminal profile would produce.
#[cfg(unix)]
pub(crate) fn enriched_path() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();
    let extras = [
        format!("{home}/anaconda3/bin"),
        format!("{home}/miniconda3/bin"),
        "/opt/anaconda3/bin".to_string(),
        "/opt/miniconda3/bin".to_string(),
        format!("{home}/.pyenv/shims"),
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        format!("{home}/.local/bin"),
        // LaTeX toolchains (latexmk/xelatex for the manuscript skill). MacTeX
        // /TeX Live install a stable symlink dir; TinyTeX lives under the user's
        // Library. Non-existent ones are filtered out below, so listing several
        // is free.
        "/Library/TeX/texbin".to_string(),
        format!("{home}/Library/TinyTeX/bin/universal-darwin"),
        format!("{home}/Library/TinyTeX/bin/x86_64-darwin"),
        format!("{home}/.TinyTeX/bin/universal-darwin"),
        format!("{home}/bin"),
    ];
    let mut parts: Vec<String> = extras
        .into_iter()
        .filter(|p| !base.split(':').any(|b| b == p) && std::path::Path::new(p).is_dir())
        .collect();
    if !base.is_empty() {
        parts.push(base);
    }
    parts.join(":")
}

/// The PATH the agent's shell runs under. Beyond the user's own tools
/// (`enriched_path` on unix), this prepends two app-bundled dirs so the agent's
/// documented `uv`/`python3` commands actually resolve — on BOTH platforms,
/// including the no-Python audience the rules target. The app's binary dir
/// (next to the executable) holds the bundled `uv` and `opencode` sidecars, so
/// a bare `uv` in the agent's shell is found; the bundled CPython's bin dir
/// lets `uv venv` discover an interpreter with no download and makes `python3`
/// work even when none is installed. Without this the bundled uv is reachable
/// only from Rust, and AGENTS.md's `uv pip install` would fail with
/// command-not-found for exactly that user.
pub(crate) fn agent_path(app: &AppHandle) -> String {
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut parts: Vec<String> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            parts.push(dir.to_string_lossy().to_string());
        }
    }
    if let Some(py) = bundled_python(app) {
        if let Some(dir) = Path::new(&py).parent() {
            parts.push(dir.to_string_lossy().to_string());
        }
    }
    #[cfg(unix)]
    parts.push(enriched_path());
    #[cfg(windows)]
    if let Ok(base) = std::env::var("PATH") {
        parts.push(base);
    }
    parts.join(sep)
}

/// A `std::process::Command` that never pops a console window on Windows.
/// A GUI app spawning a console-subsystem child (python.exe, taskkill, git…)
/// otherwise flashes a black window per spawn — every direct spawn in this
/// crate must go through here. (Sidecars via tauri_plugin_shell already set
/// the flag internally.)
pub(crate) fn quiet_command(bin: impl AsRef<std::ffi::OsStr>) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Make a secret-holding path owner-only: 700 for directories, 600 for files
/// (unix). The runtime root carries provider/connector API keys in
/// `opencode.jsonc`/`auth.json`, and the sidecar rewrites those files with a
/// default umask while running — locking the DIRECTORY is what holds, since a
/// 700 dir is unreachable for other users whatever the file modes inside. On
/// Windows, %APPDATA% is per-user ACL'd already; nothing to do.
pub(crate) fn tighten_private(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            let mode = if meta.is_dir() { 0o700 } else { 0o600 };
            let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode));
        }
    }
    #[cfg(not(unix))]
    let _ = path;
}

/// `bytes` bytes of OS randomness as lowercase hex. Panics only if the OS
/// CSPRNG is unavailable — a machine state where serving anything is unsafe.
pub(crate) fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).expect("OS random source unavailable");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// Per-run password the sidecar requires on every HTTP request (OpenCode's
/// built-in Basic auth, `OPENCODE_SERVER_PASSWORD`). Generated fresh each app
/// launch and held only in memory — never written to disk — so a local
/// webpage that scans loopback ports can neither drive agent turns nor read
/// `/global/config` (which carries provider API keys). The webview gets it
/// via the `runtime_password` command; Tauri IPC is app-only.
/// Mirror env for uv/pip on Chinese-locale systems: python.org and PyPI are
/// slow or unreachable from mainland China, so the managed-Python download and
/// package installs go through domestic mirrors (npmmirror for
/// python-build-standalone, TUNA for PyPI). Rules: anything the user already
/// set in their environment wins; `FISHES_CHINA_MIRRORS=1/0` forces it on/off;
/// otherwise it turns on only when the system locale looks Chinese.
/// The Python interpreter bundled with the app (python-build-standalone,
/// packaged as a Tauri resource under `python-runtime/python/`), if present.
/// When it exists, uv is pointed at it so NO Python is downloaded on first
/// run — a fully offline start. Absent in a dev build that skipped the fetch
/// step: callers fall back to `--python 3.12`, uv's download path. Returns the
/// interpreter's path as a string for passing straight to `uv venv --python`.
pub(crate) fn bundled_python(app: &AppHandle) -> Option<String> {
    let base = app.path().resource_dir().ok()?.join("python-runtime").join("python");
    #[cfg(windows)]
    let py = base.join("python.exe");
    #[cfg(not(windows))]
    let py = base.join("bin").join("python3");
    py.exists().then(|| py.to_string_lossy().to_string())
}

pub(crate) fn china_mirror_env() -> Vec<(String, String)> {
    let force = std::env::var("FISHES_CHINA_MIRRORS").ok();
    let enabled = match force.as_deref() {
        Some("1") | Some("true") => true,
        Some("0") | Some("false") => false,
        _ => locale_is_chinese(),
    };
    if !enabled {
        return Vec::new();
    }
    let defaults = [
        ("UV_PYTHON_INSTALL_MIRROR", "https://registry.npmmirror.com/-/binary/python-build-standalone"),
        ("UV_DEFAULT_INDEX", "https://pypi.tuna.tsinghua.edu.cn/simple"),
        ("UV_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple"),
        ("PIP_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple"),
        // npm too: OpenCode installs its plugin shim from the npm registry on
        // FIRST boot — without a mirror, mainland-China machines stall on
        // registry.npmjs.org for minutes and the whole first launch hangs at
        // "waiting for the runtime" (user-reported on Windows). Bun (which
        // OpenCode embeds) honors npm_config_registry; the seeded bunfig.toml
        // and .npmrc below cover the config-file paths as well.
        ("NPM_CONFIG_REGISTRY", "https://registry.npmmirror.com"),
        ("npm_config_registry", "https://registry.npmmirror.com"),
    ];
    defaults
        .into_iter()
        .filter(|(k, _)| std::env::var(k).is_err()) // user's own setting wins
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

/// Whether the mirror set is active (for the setup page's environment panel).
#[tauri::command]
pub fn china_mirrors_active() -> bool {
    !china_mirror_env().is_empty()
}

fn locale_is_chinese() -> bool {
    // Cached: callers hit this on every spawn/setup, and the GUI fallbacks
    // below shell out to a system tool.
    static CACHE: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *CACHE.get_or_init(detect_chinese_locale)
}

fn detect_chinese_locale() -> bool {
    // Shell locale env first (works on Linux/Windows terminals and covers CI).
    for k in ["LC_ALL", "LC_CTYPE", "LANG"] {
        if let Ok(v) = std::env::var(k) {
            if v.starts_with("zh_CN") || v.starts_with("zh-Hans") {
                return true;
            }
        }
    }
    // GUI launches on macOS carry no LANG — ask the system preference.
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = std::process::Command::new("defaults")
            .args(["read", "-g", "AppleLocale"])
            .output()
        {
            let s = String::from_utf8_lossy(&out.stdout);
            if s.contains("zh_CN") || s.contains("zh-Hans") {
                return true;
            }
        }
    }
    // GUI launches on Windows carry no LANG either — this gap meant Chinese
    // Windows installs NEVER activated the mirrors and first boot stalled on
    // npmjs/pypi. Read the user locale from the registry (reg.exe, hidden
    // console so nothing flashes).
    #[cfg(target_os = "windows")]
    {
        if let Ok(out) = quiet_command("reg")
            .args(["query", "HKCU\\Control Panel\\International", "/v", "LocaleName"])
            .output()
        {
            let s = String::from_utf8_lossy(&out.stdout);
            if s.contains("zh-CN") || s.contains("zh-Hans") {
                return true;
            }
        }
    }
    false
}

/// Provider-credential env vars that would make OpenCode mark a provider as
/// configured without the user ever entering a key in the app. The suffix rule
/// covers the whole models.dev catalog (every provider's env is `*_API_KEY`);
/// the named extras are the known non-conforming credential vars.
fn is_credential_env(key: &str) -> bool {
    key.ends_with("_API_KEY") || matches!(key, "ANTHROPIC_AUTH_TOKEN" | "AWS_BEARER_TOKEN_BEDROCK")
}

pub(crate) fn server_password() -> &'static str {
    static PASSWORD: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    PASSWORD.get_or_init(|| random_hex(16))
}

/// Expose the per-run sidecar password to the frontend SDK client.
#[tauri::command]
pub fn runtime_password() -> String {
    server_password().to_string()
}

/// Whether the OS user locale is Chinese. The webview's navigator.language
/// follows the APP's declared localizations, not the system (a zh_CN mac
/// reports "en-US" in dev), so the frontend's default-language pick asks the
/// OS through this instead.
#[tauri::command]
pub fn system_locale_is_chinese() -> bool {
    locale_is_chinese()
}

/// Whether this install has a saved provider key on DISK (OpenCode's
/// auth.json in the app-private profile). The first-run gate asks this the
/// moment the window opens — a filesystem fact, available seconds before the
/// sidecar can answer listProviders — so a wiped or brand-new install routes
/// to the setup guide instantly instead of showing a dead workbench while the
/// runtime boots. (localStorage remembers "setup done", but it lives in the
/// webview's own storage and survives an app-data wipe — memory, not truth.)
#[tauri::command]
pub fn setup_completed_on_disk(app: AppHandle) -> bool {
    runtime_root(&app)
        .map(|r| r.join("xdg-data").join("opencode").join("auth.json").is_file())
        .unwrap_or(false)
}

pub(crate) fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(43917)
}

/// A force-killed app (crash, SIGKILL, logout) never runs its exit cleanup,
/// so its `opencode serve` child survives — holding stale config in memory
/// and rewriting it into a fresh profile the next time the paths exist.
/// Before spawning ours, kill any serve process launched from OUR binary
/// directory. The path match keeps a user's own opencode install untouched.
fn sweep_orphan_sidecars() {
    let Ok(exe) = std::env::current_exe() else { return };
    let Some(dir) = exe.parent() else { return };
    #[cfg(unix)]
    {
        let pattern = format!("^{}/opencode serve", dir.display());
        let _ = std::process::Command::new("pkill").args(["-f", &pattern]).output();
    }
    #[cfg(windows)]
    {
        let filter = format!(
            "Get-CimInstance Win32_Process -Filter \"Name='opencode.exe'\" | Where-Object {{ $_.CommandLine -like '*{}*serve*' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }}",
            dir.display().to_string().replace('\'', "")
        );
        let _ = quiet_command("powershell")
            .args(["-NoProfile", "-Command", &filter])
            .output();
    }
}

fn spawn_sidecar(app: &AppHandle, port: u16) -> Result<CommandChild, String> {
    sweep_orphan_sidecars();
    let root = runtime_root(app)?;
    let cfg = root.join("xdg-config");
    let data = root.join("xdg-data");
    let cache = root.join("xdg-cache");
    let state = root.join("xdg-state");
    // Run OpenCode inside the user-facing workspace, NOT the app's cwd (which is `/`
    // when launched from Finder) — otherwise it scans the whole filesystem root.
    let workspace = workspace_dir(app)?;
    for d in [&cfg, &data, &cache, &state] {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    // Ship the bundled scientific skills into the app-private OpenCode profile.
    deploy_bundled_skills(app);
    deploy_bundled_agents(app);
    deploy_bundled_plugins(app);
    deploy_bundled_rules(app);
    // Safety default (AGENTS.md non-negotiable): on first run, seed the
    // "approve" permission mode so dangerous shell commands prompt for
    // approval. A mode the user chose (approve or full) is never overridden.
    let cfg_file = effective_config_file(app)?;
    let existing = std::fs::read_to_string(&cfg_file).unwrap_or_default();
    if let Some(seeded) = crate::opencode_config::seed_default_permission(&existing) {
        if let Some(dir) = cfg_file.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&cfg_file, seeded).map_err(|e| e.to_string())?;
    }
    // Chinese-locale systems: OpenCode installs its plugin shim from npm on
    // first boot. Env vars cover bun's npm_config_registry path; these files
    // cover its config-file path — whichever its embedded installer reads,
    // the download comes from npmmirror instead of stalling on npmjs.org.
    // Only seeded when missing, so a user's own registry choice always wins.
    if !china_mirror_env().is_empty() {
        if let Some(cfg_dir) = cfg_file.parent() {
            let _ = std::fs::create_dir_all(cfg_dir);
            for (name, contents) in [
                ("bunfig.toml", "[install]\nregistry = \"https://registry.npmmirror.com\"\n"),
                (".npmrc", "registry=https://registry.npmmirror.com\n"),
            ] {
                let p = cfg_dir.join(name);
                if !p.exists() {
                    let _ = std::fs::write(&p, contents);
                }
            }
        }
    }
    // Secrets live under the runtime root (provider/connector keys in
    // opencode.jsonc, OpenCode's auth.json) — owner-only on every start, so
    // existing installs are repaired and whatever the sidecar later rewrites
    // inside stays unreachable to other users regardless of its umask.
    tighten_private(&root);
    tighten_private(&cfg_file);
    let home = std::env::var("HOME").unwrap_or_default();
    let port_str = port.to_string();

    let cmd = app
        .shell()
        .sidecar("opencode")
        .map_err(|e| format!("sidecar not found: {e}"))?
        .args(["serve", "--hostname", "127.0.0.1", "--port", port_str.as_str()])
        // Explicit over implicit: the sidecar sees ONLY credentials saved
        // through the app. A GUI process inherits the login shell's exports
        // (always in dev, sometimes via launchd), and OpenCode treats every
        // well-known key var (OPENROUTER_API_KEY, DEEPSEEK_API_KEY, …) as
        // "this provider is configured" — a fresh install would silently pick
        // up the user's local keys without consent (user-reported). Rebuild
        // the child env from the parent's minus credential-shaped vars; all
        // vars the app itself needs are set explicitly below.
        .env_clear()
        .envs(std::env::vars().filter(|(k, _)| !is_credential_env(k)))
        // Require auth on every request (P0-7): without a password the server
        // trusts ANY localhost-origin page (verified in the 1.17.13 source —
        // its CORS allowlist admits http://localhost:*/127.0.0.1:* wholesale,
        // and `--cors "*"` was only ever an exact-match literal, not a
        // wildcard). The webview authenticates via the SDK; nothing else may.
        .env("OPENCODE_SERVER_PASSWORD", server_password())
        // Fishes is self-contained: load only OUR bundled skills (deployed into
        // the app-private config dir), NOT the user's personal Claude Code
        // skills under ~/.claude/skills and ~/.agents/skills. Beyond keeping the
        // agent's toolset curated, this is a real startup-time fix: a Claude
        // Code power user can have hundreds of global skills, and OpenCode scans
        // them all on boot — minutes of "connecting" before the server serves.
        .env("OPENCODE_DISABLE_EXTERNAL_SKILLS", "1")
        // App-private dirs: OpenCode never touches the user's ~/.config/opencode.
        .env("XDG_CONFIG_HOME", cfg.to_string_lossy().to_string())
        .env("XDG_DATA_HOME", data.to_string_lossy().to_string())
        .env("XDG_CACHE_HOME", cache.to_string_lossy().to_string())
        .env("XDG_STATE_HOME", state.to_string_lossy().to_string())
        .env("HOME", home)
        .current_dir(workspace);
    // Domestic PyPI / python-build-standalone mirrors on Chinese-locale
    // systems: every pip/uv the AGENT runs inside a session inherits these,
    // so package installs don't stall on pypi.org from mainland China.
    let mut cmd = cmd;
    for (k, v) in china_mirror_env() {
        cmd = cmd.env(k, v);
    }
    // GUI-launched apps get a minimal PATH; give the agent the user's real tools
    // plus the bundled uv + Python so its documented commands resolve (both OSes).
    let cmd = cmd.env("PATH", agent_path(app));

    let (mut rx, child) = cmd.spawn().map_err(|e| format!("failed to spawn opencode: {e}"))?;
    // Drain events so the child's stdout/stderr buffer never blocks it.
    tauri::async_runtime::spawn(async move { while rx.recv().await.is_some() {} });
    Ok(child)
}

/// Kill and respawn the sidecar on its stable port, returning the base URL.
/// The whole kill→spawn runs while HOLDING the child mutex — it doubles as
/// the lifecycle lock, so two concurrent restarts (e.g. Settings saves racing
/// an approval-mode switch) can never double-spawn and orphan a child. This
/// is the single restart path; config-changing commands must use it.
fn restart_sidecar(app: &AppHandle, state: &RuntimeState) -> Result<String, String> {
    let mut child = state.child.lock().unwrap();
    if let Some(c) = child.take() {
        let _ = c.kill();
    }
    let port = { *state.port.lock().unwrap().get_or_insert_with(free_port) };
    *child = Some(spawn_sidecar(app, port)?);
    let url = format!("http://127.0.0.1:{port}");
    *state.url.lock().unwrap() = Some(url.clone());
    Ok(url)
}

/// Start the bundled OpenCode (idempotent). Returns its base URL. `async`:
/// skill-pack deployment + process spawn at startup must not block the UI
/// thread while the first window paints.
#[tauri::command(async)]
pub fn start_runtime(app: AppHandle, state: State<'_, RuntimeState>) -> Result<String, String> {
    if let Some(url) = state.url.lock().unwrap().clone() {
        return Ok(url);
    }
    // Reuse a stable port across restarts so the frontend URL doesn't change.
    let port = {
        let mut p = state.port.lock().unwrap();
        *p.get_or_insert_with(free_port)
    };
    let child = spawn_sidecar(&app, port)?;
    let url = format!("http://127.0.0.1:{port}");
    *state.child.lock().unwrap() = Some(child);
    *state.url.lock().unwrap() = Some(url.clone());
    Ok(url)
}

/// The workspace directory the sidecar runs in — the frontend passes it to the
/// SDK so skill discovery is scoped to the right OpenCode instance.
#[tauri::command]
pub fn workspace_path(app: AppHandle) -> Result<String, String> {
    Ok(workspace_dir(&app)?.to_string_lossy().to_string())
}

/// The base folder new dated workspaces are created under (`~/Documents/OpenScience`).
#[tauri::command]
pub fn workspace_base(app: AppHandle) -> Result<String, String> {
    Ok(base_workspace_dir(&app)?.to_string_lossy().to_string())
}

/// Choose the base folder (Settings → Workspace → Change). Creates it if
/// needed and persists the choice; every NEW session's dated folder is created
/// under it. Existing sessions keep their folders.
#[tauri::command]
pub fn set_workspace_base(app: AppHandle, path: String) -> Result<String, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_absolute() {
        return Err("workspace base must be absolute".into());
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create folder: {e}"))?;
    let canon = dir.canonicalize().map_err(|e| e.to_string())?;
    std::fs::write(base_workspace_file(&app)?, canon.to_string_lossy().as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(canon.to_string_lossy().to_string())
}

/// Reveal the base workspace folder in the OS file manager. (The sandboxed
/// `open_path` resolves inside the ACTIVE workspace only, which may be a dated
/// subfolder — the base needs its own door.)
#[tauri::command]
pub fn open_workspace_base(app: AppHandle) -> Result<(), String> {
    crate::artifact_file::os_open(&base_workspace_dir(&app)?)
}

/// Switch the active workspace folder: create it if needed and persist the
/// choice. The kernel / Files / provenance read the folder via `workspace_dir`;
/// the agent runtime is scoped per request — the frontend reconnects its event
/// stream with `?directory=` and creates sessions with it (a bare `/event`
/// stream would not see other folders' instances, so the scoped stream is
/// required). `path` must be absolute.
#[tauri::command(async)]
pub fn set_workspace(
    app: AppHandle,
    _state: State<'_, RuntimeState>,
    path: String,
) -> Result<String, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_absolute() {
        return Err("workspace path must be absolute".into());
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create folder: {e}"))?;
    let canon = dir.canonicalize().map_err(|e| e.to_string())?;
    std::fs::write(active_workspace_file(&app)?, canon.to_string_lossy().as_bytes())
        .map_err(|e| e.to_string())?;

    // Seed the tested Stata JSON dumper into the workspace root (Stata's cwd
    // when the agent runs a do-file). The stata-analyze skill has the model
    // call `qui do "_qdump.do"` + `qdump ...` instead of hand-writing the
    // fragile `file write` JSON — a weak model kept mis-escaping that and
    // burning retries on r(198). Rewritten every switch so upgrades win; a
    // failure here must never block the workspace switch.
    let _ = std::fs::write(canon.join("_qdump.do"), QDUMP_DO);

    // No sidecar restart: OpenCode serves every folder from one process via
    // per-directory instances, and the frontend reconnects its event stream
    // with `?directory=<new folder>`. Restarting here used to cost 3-6 s per
    // history-session switch (process boot + reconnect polling).
    // Jupyter-lab, however, pins its root_dir at spawn time — re-root it (in
    // the background) so agent-created notebooks land in the new folder.
    crate::jupyter::reroot_jupyter(&app);
    Ok(canon.to_string_lossy().to_string())
}

/// Create a new dated folder `<base>/<name>` and switch to it. `name` is a
/// single path segment (the frontend supplies a timestamp); rejects separators.
#[tauri::command(async)]
pub fn new_dated_workspace(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    name: String,
) -> Result<String, String> {
    // No separators, no `..`, and no whitespace — an unquoted space in this
    // path would break the shell commands the agent runs against it. The
    // frontend sanitizes the user's name into a space-free segment; this is the
    // backstop.
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || name.chars().any(char::is_whitespace)
    {
        return Err("invalid folder name".into());
    }
    let dir = base_workspace_dir(&app)?.join(&name);
    set_workspace(app, state, dir.to_string_lossy().to_string())
}

/// Whether an absolute path exists as a directory. Used to prune the
/// recent-projects list of folders that were moved or deleted — offering a
/// dead recent would silently recreate an empty folder on click (set_workspace
/// creates its target).
#[tauri::command]
pub fn dir_exists(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

/// Native "choose a folder" dialog; returns the absolute path, or None on cancel.
#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Kill the bundled OpenCode if running.
#[tauri::command]
pub fn stop_runtime(state: State<'_, RuntimeState>) {
    if let Some(child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
    }
    *state.url.lock().unwrap() = None;
}

pub fn kill_child(state: &RuntimeState) {
    if let Some(child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::{
        migrate_dir, random_hex, remove_key_from_config, repoint_workspace_files, sync_skill_pack,
    };
    use std::fs;

    #[test]
    fn migrate_dir_moves_only_when_old_exists_and_new_absent() {
        let base = std::env::temp_dir().join(format!("mig-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let old = base.join("com.praxis.app");
        let new = base.join("com.fishes.app");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("settings.json"), b"{}").unwrap();

        // Old present, new absent → moves, carrying the file over.
        assert!(migrate_dir(&old, &new));
        assert!(!old.exists());
        assert!(new.join("settings.json").is_file());

        // Idempotent: second run finds new already there, old gone → no-op.
        assert!(!migrate_dir(&old, &new));

        // Guard: never clobber an existing new dir even if an old one reappears.
        fs::create_dir_all(&old).unwrap();
        fs::write(new.join("settings.json"), b"{\"kept\":true}").unwrap();
        assert!(!migrate_dir(&old, &new));
        assert_eq!(fs::read_to_string(new.join("settings.json")).unwrap(), "{\"kept\":true}");
        assert!(old.is_dir());

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn repoint_rewrites_only_paths_under_the_old_root() {
        let base = std::env::temp_dir().join(format!("repoint-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).unwrap();
        let old_root = std::path::Path::new("/Users/x/Praxis");
        let new_root = std::path::Path::new("/Users/x/Fishes");
        let under = base.join("active.txt");
        let elsewhere = base.join("base.txt");
        fs::write(&under, "/Users/x/Praxis/2026-07-19-0808").unwrap();
        fs::write(&elsewhere, "/Users/x/Documents/custom-project").unwrap();

        repoint_workspace_files(&[under.clone(), elsewhere.clone()], old_root, new_root);

        assert_eq!(fs::read_to_string(&under).unwrap(), "/Users/x/Fishes/2026-07-19-0808");
        // A custom folder outside the old root is left exactly as the user set it.
        assert_eq!(fs::read_to_string(&elsewhere).unwrap(), "/Users/x/Documents/custom-project");
        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn tighten_private_makes_dir_and_secrets_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("os-private-{}", std::process::id()));
        let sub = dir.join("opencode");
        fs::create_dir_all(&sub).unwrap();
        let cfg = sub.join("opencode.jsonc");
        fs::write(&cfg, b"{\"apiKey\":\"secret\"}").unwrap();
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o755)).unwrap();
        fs::set_permissions(&cfg, fs::Permissions::from_mode(0o644)).unwrap();

        // The runtime root holds provider/connector keys (opencode.jsonc,
        // auth.json) — it must be unreadable to other users even when the
        // sidecar later rewrites files inside with a default umask.
        super::tighten_private(&dir);
        assert_eq!(fs::metadata(&dir).unwrap().permissions().mode() & 0o777, 0o700);
        super::tighten_private(&cfg);
        assert_eq!(fs::metadata(&cfg).unwrap().permissions().mode() & 0o777, 0o600);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn random_hex_is_csprng_shaped() {
        // 16 bytes → 32 hex chars, fresh per call — the shape the sidecar
        // password and the preview/Jupyter tokens rely on.
        let a = random_hex(16);
        let b = random_hex(16);
        assert_eq!(a.len(), 32);
        assert!(a.bytes().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b, "two draws must differ");
    }

    #[test]
    fn removes_only_the_named_config_entry() {
        let cfg = r#"{"model":"a/b","provider":{"ollama":{"npm":"x"},"keep":{"npm":"y"}},"mcp":{"pw":{"type":"local"}}}"#;
        let out = remove_key_from_config(cfg, "provider", "ollama").unwrap();
        assert!(!out.contains("ollama"));
        assert!(out.contains("keep"));
        assert!(out.contains("\"model\": \"a/b\""));
        let out2 = remove_key_from_config(cfg, "mcp", "pw").unwrap();
        assert!(!out2.contains("\"pw\""));
        // Absent key and non-JSON input are errors, not silent no-ops.
        assert!(remove_key_from_config(cfg, "provider", "missing").is_err());
        assert!(remove_key_from_config("// jsonc comment\n{}", "provider", "x").is_err());
    }

    fn write(path: &std::path::Path, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    #[test]
    fn sync_replaces_bundled_and_keeps_user_skills() {
        let tmp = std::env::temp_dir().join(format!("skillsync-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let src = tmp.join("src");
        let dst = tmp.join("dst");

        // Bundled pack: one skill with a nested reference file, plus a top-level
        // plain file (.commit) that must NOT be copied.
        write(&src.join("paper-writer/SKILL.md"), "v2");
        write(&src.join("paper-writer/references/guide.md"), "ref");
        write(&src.join(".commit"), "abc123");
        // A placeholder dir without SKILL.md must not be deployed.
        fs::create_dir_all(src.join("placeholder")).unwrap();

        // Existing workspace: a stale copy of the bundled skill (with a file the
        // new version no longer has) and a user-installed skill.
        write(&dst.join("paper-writer/SKILL.md"), "v1");
        write(&dst.join("paper-writer/obsolete.md"), "old");
        write(&dst.join("my-skill/SKILL.md"), "user");

        let names = sync_skill_pack(&src, &dst).unwrap();
        assert_eq!(names, vec!["paper-writer".to_string()]);

        assert_eq!(fs::read_to_string(dst.join("paper-writer/SKILL.md")).unwrap(), "v2");
        assert_eq!(
            fs::read_to_string(dst.join("paper-writer/references/guide.md")).unwrap(),
            "ref"
        );
        assert!(!dst.join("paper-writer/obsolete.md").exists(), "stale file must be gone");
        assert_eq!(fs::read_to_string(dst.join("my-skill/SKILL.md")).unwrap(), "user");
        assert!(!dst.join(".commit").exists(), "top-level files are not skills");
        assert!(!dst.join("placeholder").exists(), "dirs without SKILL.md are not skills");

        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn prune_removes_retired_bundled_skills_but_never_user_dirs() {
        let tmp = std::env::temp_dir().join(format!("skillprune-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let dst = tmp.join("skills");

        // Last deploy shipped ai4s-agent + mindmap-render; the user added one.
        write(&dst.join("ai4s-agent/SKILL.md"), "retired upstream skill");
        write(&dst.join("mindmap-render/SKILL.md"), "still bundled");
        write(&dst.join("my-skill/SKILL.md"), "user-made");
        write(&dst.join(".fishes-deployed"), "ai4s-agent\nmindmap-render");

        // This deploy no longer ships ai4s-agent.
        let deployed = vec!["mindmap-render".to_string()];
        super::prune_retired(&dst, &deployed);

        assert!(!dst.join("ai4s-agent").exists(), "retired bundled skill must be pruned");
        assert!(dst.join("mindmap-render").exists());
        assert!(dst.join("my-skill").exists(), "user dirs are never pruned");
        assert_eq!(
            fs::read_to_string(dst.join(".fishes-deployed")).unwrap(),
            "mindmap-render"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn prune_without_manifest_deletes_nothing() {
        let tmp = std::env::temp_dir().join(format!("skillprune-nom-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let dst = tmp.join("skills");
        // Pre-manifest installs (or a hand-managed dir): nothing may be deleted.
        write(&dst.join("ai4s-agent/SKILL.md"), "legacy");
        super::prune_retired(&dst, &["mindmap-render".to_string()]);
        assert!(dst.join("ai4s-agent").exists(), "no manifest → no deletions");
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn sync_creates_destination_when_missing() {
        let tmp = std::env::temp_dir().join(format!("skillsync-new-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let src = tmp.join("src");
        write(&src.join("literature-survey/SKILL.md"), "s");

        let dst = tmp.join("deep/nested/skills");
        sync_skill_pack(&src, &dst).unwrap();
        assert_eq!(
            fs::read_to_string(dst.join("literature-survey/SKILL.md")).unwrap(),
            "s"
        );
        fs::remove_dir_all(&tmp).unwrap();
    }
}

/// Remove an entry from a map section of the app-private global OpenCode
/// config ("provider" or "mcp") and restart the sidecar (PATCH /global/config
/// cannot delete keys).
#[tauri::command(async)]
pub fn remove_config_entry(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    section: String,
    key: String,
) -> Result<(), String> {
    if !matches!(section.as_str(), "provider" | "mcp") {
        return Err(format!("section \"{section}\" is not removable"));
    }
    let dir = xdg_config_home(&app)?.join("opencode");
    // The server writes opencode.jsonc; older configs may be opencode.json.
    let path = ["opencode.jsonc", "opencode.json"]
        .iter()
        .map(|n| dir.join(n))
        .find(|p| p.exists())
        .ok_or("no global OpenCode config found")?;
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let out = remove_key_from_config(&text, &section, &key)?;
    std::fs::write(&path, out).map_err(|e| e.to_string())?;
    tighten_private(&path);

    if state.url.lock().unwrap().is_some() {
        restart_sidecar(&app, &state)?;
    }
    Ok(())
}

/// Drop `key` from the config JSON's `section` map, erroring when the config
/// is not plain JSON or the key is absent.
fn remove_key_from_config(text: &str, section: &str, key: &str) -> Result<String, String> {
    let mut cfg: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("config is not plain JSON: {e}"))?;
    let removed = cfg
        .get_mut(section)
        .and_then(|p| p.as_object_mut())
        .map(|p| p.remove(key).is_some())
        .unwrap_or(false);
    if !removed {
        return Err(format!("\"{key}\" is not in the config's {section} section"));
    }
    serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())
}

/// The current approval mode ("approve" | "full"). Spawn seeding guarantees a
/// mode exists once the runtime has started; before that, report the default.
#[tauri::command]
pub fn get_approval_mode(app: AppHandle) -> Result<String, String> {
    let path = effective_config_file(&app)?;
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    Ok(crate::opencode_config::permission_mode_of(&existing)
        .unwrap_or(crate::opencode_config::MODE_APPROVE)
        .to_string())
}

/// Switch the approval mode and restart the sidecar so the permission rules
/// take effect. Returns the (stable-port) base URL when it was running.
#[tauri::command(async)]
pub fn set_approval_mode(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    mode: String,
) -> Result<String, String> {
    let path = effective_config_file(&app)?;
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let updated = crate::opencode_config::set_permission_mode(&existing, &mode)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, updated).map_err(|e| e.to_string())?;
    tighten_private(&path);

    // Same restart flow as configure_opencode: reload rules on a stable port.
    if state.url.lock().unwrap().is_some() {
        restart_sidecar(&app, &state)
    } else {
        Ok(path.to_string_lossy().to_string())
    }
}

/// The bundled skills the user has disabled (profile skill directory names).
/// The Skills page cross-references this with the runtime's live skill list to
/// show which are off and offer re-enabling.
#[tauri::command]
pub fn list_disabled_skills(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(read_disabled_skills(&app))
}

/// Enable or disable a bundled skill by its profile directory name. Disabling
/// records the name and restarts the sidecar; the next start removes that
/// skill's directory (see `deploy_bundled_skills`) so OpenCode no longer
/// registers it and the agent cannot load it. Enabling drops the name and
/// restarts, so the bundled copy is re-deployed. `name` must be a single path
/// segment.
#[tauri::command(async)]
pub fn set_skill_disabled(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    name: String,
    disabled: bool,
) -> Result<String, String> {
    let name = name.trim().to_string();
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || name.chars().any(char::is_whitespace)
    {
        return Err("invalid skill name".into());
    }
    let path = disabled_skills_file(&app)?;
    let mut set: Vec<String> = read_disabled_skills(&app);
    let present = set.iter().any(|n| n == &name);
    if disabled && !present {
        set.push(name);
    } else if !disabled && present {
        set.retain(|n| n != &name);
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, set.join("\n")).map_err(|e| e.to_string())?;

    // Re-run deployment (which applies the disable set) on a stable port so the
    // change takes effect. OpenCode builds its skill registry at start, so a
    // restart is what makes a newly disabled skill actually disappear.
    if state.url.lock().unwrap().is_some() {
        restart_sidecar(&app, &state)
    } else {
        Ok(path.to_string_lossy().to_string())
    }
}

/// Write the provider key/model into the app-private OpenCode config and restart
/// the sidecar so it picks them up. Returns the same base URL (stable port).
#[tauri::command(async)]
pub fn configure_opencode(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    provider: String,
    api_key: String,
    model: String,
    base_url: Option<String>,
) -> Result<String, String> {
    let path = opencode_config_file(&app)?;
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let merged = merge_config(&existing, &provider, &api_key, &model, base_url.as_deref())?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, merged).map_err(|e| e.to_string())?;
    tighten_private(&path);

    // Restart so the running server reloads the new provider config.
    if state.url.lock().unwrap().is_some() {
        restart_sidecar(&app, &state)
    } else {
        Ok(path.to_string_lossy().to_string())
    }
}
