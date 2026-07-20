// Curated open-source science MCP connectors (P1-2). We do NOT reimplement
// literature/database access — we one-click provision existing open-source MCP
// servers (e.g. paper-search-mcp, biomcp) into a shared ISOLATED uv env under
// app data (the user's Python is untouched), then register them in OpenCode's
// config. The frontend holds the curated catalog; here we just install a pip
// package and report the managed interpreter path.
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

fn env_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("runtime")
        .join("science-mcp-env"))
}

/// Absolute path to the managed interpreter in the shared science-MCP env.
fn python_bin(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = env_dir(app)?;
    #[cfg(windows)]
    return Ok(dir.join("Scripts").join("python.exe"));
    #[cfg(not(windows))]
    Ok(dir.join("bin").join("python"))
}

/// The managed interpreter path if the shared env exists, else None. The
/// frontend derives launch commands (`<python> -m <module> …`) from this.
#[tauri::command]
pub fn science_mcp_python(app: AppHandle) -> Result<Option<String>, String> {
    let py = python_bin(&app)?;
    Ok(py.exists().then(|| py.to_string_lossy().to_string()))
}

/// Remove the shared env entirely so the next setup starts clean. The silent
/// self-heal path: a half-written env (interrupted download, broken install)
/// is discarded and rebuilt rather than surfaced to the user.
#[tauri::command]
pub fn reset_science_mcp_env(app: AppHandle) -> Result<(), String> {
    let dir = env_dir(&app)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Provision one open-source MCP package into the shared isolated env with the
/// bundled uv (creating the env on first use), and return the managed Python
/// path to launch it with. First run downloads a managed Python (~tens of MB);
/// installing a package is incremental. Async so the UI stays responsive.
#[tauri::command]
pub async fn setup_science_mcp(app: AppHandle, package: String) -> Result<String, String> {
    // Guard against a caller sending an arbitrary spec (flags, extra args).
    if !is_safe_package(&package) {
        return Err("invalid package name".into());
    }
    let dir = env_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Prefer the bundled interpreter (offline, zero download); fall back to
    // uv's "3.12" download only when the app shipped without it.
    let py = crate::runtime::bundled_python(&app).unwrap_or_else(|| "3.12".to_string());
    let mut venv_cmd = app
        .shell()
        .sidecar("uv")
        .map_err(|e| format!("uv sidecar not found: {e}"))?
        .args(["venv", &dir.to_string_lossy(), "--python", &py, "--allow-existing"]);
    // Chinese-locale systems: pull the managed Python / packages via domestic
    // mirrors — python.org and PyPI are slow or blocked there.
    for (k, v) in crate::runtime::china_mirror_env() {
        venv_cmd = venv_cmd.env(k, v);
    }
    let venv = venv_cmd
        .output()
        .await
        .map_err(|e| format!("uv venv failed to run: {e}"))?;
    if !venv.status.success() {
        return Err(format!("uv venv failed: {}", String::from_utf8_lossy(&venv.stderr)));
    }

    let py = python_bin(&app)?;
    let mut install_cmd = app
        .shell()
        .sidecar("uv")
        .map_err(|e| format!("uv sidecar not found: {e}"))?
        .args(["pip", "install", "--python", &py.to_string_lossy(), &package]);
    for (k, v) in crate::runtime::china_mirror_env() {
        install_cmd = install_cmd.env(k, v);
    }
    let install = install_cmd
        .output()
        .await
        .map_err(|e| format!("uv pip install failed to run: {e}"))?;
    if !install.status.success() {
        return Err(format!(
            "uv pip install failed: {}",
            String::from_utf8_lossy(&install.stderr)
        ));
    }
    seed_quiet_sitecustomize(&app);
    Ok(py.to_string_lossy().to_string())
}

/// Resolve the ACTUAL Stata executable the bridge will launch, and pin it.
/// Runs inside the isolated env: reuse a still-valid pinned path; otherwise
/// let the bridge's own finder look (on Windows it scans every drive);
/// otherwise derive an executable from the directory our detection found
/// (passed as argv[1]). Whatever wins is persisted via the bridge's official
/// `Config.set_stata_cli`, so what we verified is exactly what will run.
const RESOLVE_AND_PIN: &str = r#"
import glob, os, sys
from stata_mcp.config import Config
cfg = Config()
cli = cfg.get_stata_cli()
if cli and os.path.isfile(cli):
    print(cli)
    sys.exit(0)
found = None
try:
    from stata_mcp.stata import StataFinder
    found = StataFinder(None).STATA_CLI
except Exception:
    found = None
if not found and len(sys.argv) > 1 and sys.argv[1]:
    base = sys.argv[1]
    for pat in (
        os.path.join(base, "Stata*.exe"),
        os.path.join(base, "Stata*", "Stata*.exe"),
        os.path.join(base, "Stata*.app", "Contents", "MacOS", "stata*"),
        os.path.join(base, "stata*"),
    ):
        hits = sorted(h for h in glob.glob(pat) if os.path.isfile(h))
        if hits:
            found = hits[-1]
            break
if not found:
    sys.exit(3)
print(Config().set_stata_cli(found))
"#;

/// After "Connect Stata" the page must report something true, with the exact
/// failure when there is one. Checks, each with its own error code the
/// frontend translates: the isolated env exists, the bridge package is really
/// installed in it, and the bridge can actually resolve a Stata executable —
/// which gets pinned into the bridge's own config so the verified path is the
/// one that runs. Stata itself is deliberately NOT launched here — batch mode
/// drops log files as a side effect (see tools.rs); the demo is the real
/// first run.
#[tauri::command]
pub async fn test_stata_bridge(app: AppHandle, package: String) -> Result<String, String> {
    if !is_safe_package(&package) {
        return Err("bridge_env_missing: invalid package name".into());
    }
    let py = python_bin(&app)?;
    if !py.exists() {
        return Err("bridge_env_missing: the isolated environment was not created".into());
    }
    // Heal envs provisioned by older builds: the quiet-subprocess shim keeps
    // every do-file run windowless on Windows (see QUIET_SITECUSTOMIZE).
    seed_quiet_sitecustomize(&app);
    // importlib.metadata sees the installed distribution without importing the
    // module — no server side effects, and it works whatever the module name.
    // The catalog may pin a version ("stata-mcp==1.20.2") — that spec is for
    // pip; distribution() wants the bare name and raises PackageNotFoundError
    // on the full spec, which would fail every test of a healthy env.
    let name = package.split_once("==").map(|(n, _)| n).unwrap_or(&package);
    let check = format!("import importlib.metadata as m; m.distribution('{name}'); print('ok')");
    let out = app
        .shell()
        .command(py.to_string_lossy().to_string())
        .args(["-c", &check])
        .output()
        .await
        .map_err(|e| format!("bridge_import: python failed to run: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let tail: String = err.chars().take(200).collect();
        return Err(format!("bridge_import: {tail}"));
    }
    // Our fast scan's hit becomes the fallback hint: "StataMP (D:\Stata18)" →
    // the directory in parentheses.
    let hint = crate::tools::find_stata()
        .and_then(|s| {
            s.rsplit_once('(')
                .map(|(_, tail)| tail.trim_end_matches(')').trim().to_string())
        })
        .unwrap_or_default();
    let resolve = app
        .shell()
        .command(py.to_string_lossy().to_string())
        .args(["-c", RESOLVE_AND_PIN, &hint])
        .output()
        .await
        .map_err(|e| format!("bridge_import: python failed to run: {e}"))?;
    if resolve.status.success() {
        let cli = String::from_utf8_lossy(&resolve.stdout).trim().to_string();
        if !cli.is_empty() {
            return Ok(cli);
        }
    }
    Err("stata_not_found: no Stata executable could be resolved on this machine".into())
}

/// Windows: every do-file run inside the bridge spawns a cmd.exe console —
/// stata-mcp executes `subprocess.run(..., shell=True)` per run (do.py).
/// Python auto-imports `sitecustomize` at startup, so seeding this into the
/// env's site-packages makes EVERY subprocess the bridge spawns windowless via
/// CREATE_NO_WINDOW, killing that console flash. No-op on other OSes.
///
/// Stata's OWN GUI window still shows briefly during a run — Stata displays it
/// itself, ignoring SW_HIDE — and we deliberately LEAVE it visible. Routing the
/// run onto an off-screen desktop (an earlier attempt) hid the flash but made
/// Stata HANG whenever it popped a startup dialog (license / first-run) that no
/// one could see or dismiss, so analyses timed out. A brief visible window the
/// user can interact with beats an invisible hang. Do not re-hide it.
const QUIET_SITECUSTOMIZE: &str = r#"# Fishes: keep bridge subprocess consoles hidden on Windows.
# Each agent-driven do-file run otherwise flashes a cmd.exe console —
# reads as instability during long analyses. Stata's own window stays visible
# on purpose (hiding it off-screen made it hang on undismissable dialogs).
import os

if os.name == "nt":
    import subprocess

    _Popen = subprocess.Popen

    class _QuietPopen(_Popen):
        def __init__(self, *args, **kwargs):
            si = kwargs.get("startupinfo") or subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            si.wShowWindow = 0  # SW_HIDE
            kwargs["startupinfo"] = si
            kwargs["creationflags"] = (
                kwargs.get("creationflags", 0) | subprocess.CREATE_NO_WINDOW
            )
            super().__init__(*args, **kwargs)

    subprocess.Popen = _QuietPopen
"#;

/// Write the quiet-subprocess shim into the env's site-packages (Windows
/// layout: `<env>\Lib\site-packages`). Idempotent; called after installs AND
/// before bridge tests so machines provisioned by older builds heal too.
fn seed_quiet_sitecustomize(app: &AppHandle) {
    let Ok(dir) = env_dir(app) else { return };
    let site = if cfg!(windows) {
        dir.join("Lib").join("site-packages")
    } else {
        // Unix layout nests a python3.x dir; find it rather than hardcoding.
        let Some(found) = std::fs::read_dir(dir.join("lib"))
            .ok()
            .and_then(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.path().join("site-packages"))
                    .find(|p| p.is_dir())
            })
        else {
            return;
        };
        found
    };
    let target = site.join("sitecustomize.py");
    let stale = std::fs::read_to_string(&target).map(|c| c != QUIET_SITECUSTOMIZE).unwrap_or(true);
    if site.is_dir() && stale {
        let _ = std::fs::write(&target, QUIET_SITECUSTOMIZE);
    }
}

/// The app must never DECLARE "no Stata on this machine" — scans are
/// heuristics and real installs hide in renamed folders, odd drives, repacks.
/// This is the user's final say: a native picker chooses the Stata program
/// themselves, we pin it through the bridge's official `Config.set_stata_cli`,
/// and the caller re-tests. On macOS picking the .app bundle is the natural
/// gesture — map it to the CLI binary inside Contents/MacOS.
/// Returns the pinned CLI path, or None when the user cancels.
#[tauri::command(async)]
pub async fn pin_stata_cli(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let py = python_bin(&app)?;
    if !py.exists() {
        return Err("bridge_env_missing: the isolated environment was not created".into());
    }
    let Some(choice) = app.dialog().file().blocking_pick_file() else {
        return Ok(None); // user cancelled
    };
    let picked = choice.into_path().map_err(|e| e.to_string())?;
    let cli = stata_cli_from_pick(&picked)
        .ok_or("stata_pick_invalid: that selection does not contain a runnable Stata program")?;
    let pin = "import sys\nfrom stata_mcp.config import Config\nprint(Config().set_stata_cli(sys.argv[1]))";
    let out = app
        .shell()
        .command(py.to_string_lossy().to_string())
        .args(["-c", pin, &cli.to_string_lossy()])
        .output()
        .await
        .map_err(|e| format!("bridge_import: python failed to run: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let tail: String = err.chars().take(200).collect();
        return Err(format!("bridge_import: {tail}"));
    }
    Ok(Some(cli.to_string_lossy().to_string()))
}

/// A picked path → the actual Stata CLI to pin. A .app bundle maps to the
/// binary inside Contents/MacOS (prefer the edition CLIs over the GUI
/// launcher); a plain file is taken as-is when it exists.
fn stata_cli_from_pick(picked: &std::path::Path) -> Option<std::path::PathBuf> {
    if picked.extension().is_some_and(|e| e.eq_ignore_ascii_case("app")) {
        let macos = picked.join("Contents").join("MacOS");
        let entries: Vec<std::path::PathBuf> = std::fs::read_dir(&macos)
            .ok()?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_file())
            .collect();
        // stata-mp / stata-se / stata (console CLIs) before StataMP (the GUI).
        for want in ["stata-mp", "stata-se", "stata-be", "stata"] {
            if let Some(hit) = entries.iter().find(|p| {
                p.file_name().is_some_and(|n| n.to_string_lossy().to_lowercase() == want)
            }) {
                return Some(hit.clone());
            }
        }
        return entries
            .iter()
            .find(|p| {
                p.file_name()
                    .is_some_and(|n| n.to_string_lossy().to_lowercase().contains("stata"))
            })
            .cloned();
    }
    picked.is_file().then(|| picked.to_path_buf())
}

/// A PyPI package name (letters/digits/._-), optionally pinned with `==<version>`.
/// Rejects anything that could smuggle extra pip args or shell metacharacters.
fn is_safe_package(pkg: &str) -> bool {
    let core = pkg.split_once("==").map(|(n, _)| n).unwrap_or(pkg);
    !core.is_empty()
        && !core.starts_with('-')
        && core.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        && pkg.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '='))
}

#[cfg(test)]
mod tests {
    use super::{is_safe_package, stata_cli_from_pick};

    #[test]
    fn pick_maps_app_bundle_to_inner_cli_and_validates_files() {
        let root = std::env::temp_dir().join(format!("ai4s-pick-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let macos = root.join("StataMP.app/Contents/MacOS");
        std::fs::create_dir_all(&macos).unwrap();
        std::fs::write(macos.join("StataMP"), b"gui").unwrap(); // GUI launcher
        std::fs::write(macos.join("stata-mp"), b"cli").unwrap(); // console CLI

        // The .app bundle maps to the console CLI, not the GUI binary.
        assert_eq!(
            stata_cli_from_pick(&root.join("StataMP.app")).unwrap(),
            macos.join("stata-mp")
        );
        // A plain existing file is taken as-is; a missing path is rejected.
        assert_eq!(
            stata_cli_from_pick(&macos.join("stata-mp")).unwrap(),
            macos.join("stata-mp")
        );
        assert!(stata_cli_from_pick(&root.join("nope.exe")).is_none());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn accepts_real_package_names_and_pins() {
        assert!(is_safe_package("paper-search-mcp"));
        assert!(is_safe_package("biomcp-python"));
        assert!(is_safe_package("jupyter-mcp-server==0.14.0"));
    }

    #[test]
    fn rejects_flag_and_metacharacter_injection() {
        assert!(!is_safe_package(""));
        assert!(!is_safe_package("--upgrade"));
        assert!(!is_safe_package("pkg; rm -rf /"));
        assert!(!is_safe_package("pkg && echo"));
        assert!(!is_safe_package("pkg --index-url http://evil"));
        assert!(!is_safe_package("pkg\nother"));
    }
}
