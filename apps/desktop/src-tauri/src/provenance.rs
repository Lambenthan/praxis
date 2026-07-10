// Artifact provenance (P0-3): every agent write of a workspace file appends a
// version record to <workspace>/.openscience/provenance.jsonl — append-only,
// one JSON object per line, so any artifact can reveal its generating code,
// environment, and originating conversation, per version.
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::runtime::workspace_dir;

const STORE_DIR: &str = ".openscience";
const STORE_FILE: &str = "provenance.jsonl";
/// Per-record content cap: keeps the store bounded; larger writes are truncated.
const CONTENT_CAP: usize = 100_000;

/// Serializes appends so two tool events can't interleave lines or race versions.
#[derive(Default)]
pub struct ProvenanceState(pub Mutex<()>);

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvenanceRecord {
    /// Workspace-relative artifact path with `/` separators.
    pub path: String,
    /// 1-based version, assigned on append.
    pub version: u32,
    /// Seconds since the epoch (the frontend formats it).
    pub ts: u64,
    /// Tool that produced this version, e.g. "write".
    pub tool: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Text the tool wrote (capped); absent for binary or indirect writes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub log: Option<String>,
    /// Runtime environment captured when the version was recorded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<EnvInfo>,
}

/// The environment a version was produced in — enough to reproduce: which
/// Python, which OS/arch, which app build, and which installed packages.
/// Captured once per app run (cheap).
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvInfo {
    /// Local Python version, e.g. "3.12.4" (the interpreter agent code runs on).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub python: Option<String>,
    /// OS and architecture, e.g. "macos-aarch64".
    pub platform: String,
    /// Open Science app version that recorded this.
    pub app: String,
    /// Installed Python packages (pip freeze), content-addressed to a lockfile.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub packages: Option<PackageSnapshot>,
}

/// A snapshot of the installed Python packages at record time. The full
/// `name==version` list is stored once, content-addressed, at
/// `.openscience/env/<hash>.txt`; records carry only the count + hash so the
/// store stays small and identical environments dedupe to one lockfile.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageSnapshot {
    /// Number of installed packages captured.
    pub count: u32,
    /// Short content hash; the lockfile is `.openscience/env/<hash>.txt`.
    pub hash: String,
}

const ENV_DIR: &str = "env";

/// Capture `pip freeze` once per app run — a per-write process spawn would slow
/// every agent edit. Returns the raw `name==version` list.
fn pip_freeze() -> Option<String> {
    static CACHE: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
    CACHE
        .get_or_init(|| {
            let bin = crate::kernel::python_bin()?;
            let out = crate::runtime::quiet_command(bin)
                .args(["-m", "pip", "freeze"])
                .output()
                .ok()?;
            if !out.status.success() {
                return None;
            }
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        })
        .clone()
}

/// A short, deterministic content hash for lockfile addressing. DefaultHasher
/// uses fixed keys, so the same freeze maps to the same file across runs.
fn content_hash(text: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// Write `freeze` to a content-addressed lockfile (once) and return its snapshot.
fn write_lockfile(root: &Path, freeze: &str) -> Result<PackageSnapshot, String> {
    let count = freeze.lines().filter(|l| !l.trim().is_empty()).count() as u32;
    let hash = content_hash(freeze);
    let dir = root.join(STORE_DIR).join(ENV_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{hash}.txt"));
    if !path.exists() {
        std::fs::write(&path, freeze).map_err(|e| e.to_string())?;
    }
    Ok(PackageSnapshot { count, hash })
}

/// Detect the local Python version once per app run — `python -V` on every
/// record would add a process spawn to each agent write.
fn python_version() -> Option<String> {
    static CACHE: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
    CACHE
        .get_or_init(|| {
            let bin = crate::kernel::python_bin()?;
            let out = crate::runtime::quiet_command(bin).arg("--version").output().ok()?;
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let text = if text.is_empty() {
                String::from_utf8_lossy(&out.stderr).trim().to_string() // Python 2 printed -V to stderr
            } else {
                text
            };
            Some(text.strip_prefix("Python ").unwrap_or(&text).to_string())
        })
        .clone()
}

fn capture_env(root: &Path, app_version: String) -> EnvInfo {
    // Package capture is best-effort: no pip / write failure just omits it.
    let packages = pip_freeze().and_then(|f| write_lockfile(root, &f).ok());
    EnvInfo {
        python: python_version(),
        platform: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
        app: app_version,
        packages,
    }
}

/// Normalize an artifact path (absolute or relative, from tool input) to a
/// workspace-relative `/`-separated key. Paths escaping the workspace are rejected.
fn normalize_rel(root: &Path, path: &str) -> Result<String, String> {
    let p = Path::new(path);
    let rel: PathBuf = if p.is_absolute() {
        let stripped = match (p.canonicalize(), root.canonicalize()) {
            // Prefer canonical forms (resolves /var vs /private/var on macOS)…
            (Ok(full), Ok(root_c)) => full.strip_prefix(&root_c).map(Path::to_path_buf),
            // …but the file may not exist yet — fall back to a lexical strip.
            _ => p.strip_prefix(root).map(Path::to_path_buf),
        };
        stripped.map_err(|_| "path is outside the workspace".to_string())?
    } else {
        p.to_path_buf()
    };
    if rel.as_os_str().is_empty()
        || rel.components().any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("path must stay inside the workspace".into());
    }
    Ok(rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/"))
}

fn store_file(root: &Path) -> PathBuf {
    root.join(STORE_DIR).join(STORE_FILE)
}

/// All records in the store. Unparseable lines are skipped, never fatal — the
/// store must survive a corrupt line without losing the rest of the history.
fn read_all(file: &Path) -> Vec<ProvenanceRecord> {
    let Ok(text) = std::fs::read_to_string(file) else {
        return Vec::new();
    };
    text.lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

fn cap_content(mut c: String) -> String {
    if c.len() > CONTENT_CAP {
        let mut end = CONTENT_CAP;
        while !c.is_char_boundary(end) {
            end -= 1;
        }
        c.truncate(end);
        c.push_str("\n… [truncated]");
    }
    c
}

/// Append one version record for `path`, assigning the next version number.
pub fn append_record(
    root: &Path,
    path: &str,
    tool: &str,
    session_id: Option<String>,
    model: Option<String>,
    content: Option<String>,
    log: Option<String>,
    env: Option<EnvInfo>,
) -> Result<ProvenanceRecord, String> {
    let rel = normalize_rel(root, path)?;
    let file = store_file(root);
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("provenance dir failed: {e}"))?;
    }
    let version = read_all(&file)
        .iter()
        .filter(|r| r.path == rel)
        .map(|r| r.version)
        .max()
        .unwrap_or(0)
        + 1;
    let record = ProvenanceRecord {
        path: rel,
        version,
        ts: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        tool: tool.to_string(),
        session_id,
        model,
        content: content.map(cap_content),
        log,
        env,
    };
    let line = serde_json::to_string(&record).map_err(|e| e.to_string())?;
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .map_err(|e| format!("provenance open failed: {e}"))?;
    writeln!(f, "{line}").map_err(|e| format!("provenance write failed: {e}"))?;
    Ok(record)
}

/// All recorded versions of one artifact, oldest first.
pub fn versions_for(root: &Path, path: &str) -> Result<Vec<ProvenanceRecord>, String> {
    let rel = normalize_rel(root, path)?;
    let mut v: Vec<ProvenanceRecord> = read_all(&store_file(root))
        .into_iter()
        .filter(|r| r.path == rel)
        .collect();
    v.sort_by_key(|r| r.version);
    Ok(v)
}

/// `async`: fired on every agent write; the first call shells out to
/// `pip freeze` (seconds) and every call re-reads the whole store — none of
/// which may run on the UI thread.
#[tauri::command(async)]
pub fn record_provenance(
    app: AppHandle,
    state: tauri::State<ProvenanceState>,
    path: String,
    tool: String,
    session_id: Option<String>,
    model: Option<String>,
    content: Option<String>,
    log: Option<String>,
) -> Result<ProvenanceRecord, String> {
    let _guard = state.0.lock().map_err(|_| "provenance lock poisoned")?;
    let root = workspace_dir(&app)?;
    let env = capture_env(&root, app.package_info().version.to_string());
    append_record(&root, &path, &tool, session_id, model, content, log, Some(env))
}

/// `async`: reads the whole (unbounded) store off the UI thread.
#[tauri::command(async)]
pub fn list_provenance(app: AppHandle, path: String) -> Result<Vec<ProvenanceRecord>, String> {
    versions_for(&workspace_dir(&app)?, &path)
}

/// Read a content-addressed package lockfile (`.openscience/env/<hash>.txt`).
/// `hash` is validated to hex so it cannot escape the env directory.
#[tauri::command]
pub fn read_env_lockfile(app: AppHandle, hash: String) -> Result<String, String> {
    if hash.is_empty() || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("invalid lockfile id".into());
    }
    let path = workspace_dir(&app)?
        .join(STORE_DIR)
        .join(ENV_DIR)
        .join(format!("{hash}.txt"));
    std::fs::read_to_string(&path).map_err(|e| format!("lockfile unavailable: {e}"))
}

#[cfg(test)]
mod tests {
    use super::{append_record, cap_content, normalize_rel, versions_for, CONTENT_CAP};

    fn temp_root(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ai4s-prov-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn versions_increment_per_path_and_round_trip() {
        let root = temp_root("versions");
        let r1 = append_record(&root, "fig/plot.py", "write", Some("ses_1".into()), Some("m".into()), Some("print(1)".into()), None, None).unwrap();
        let r2 = append_record(&root, "fig/plot.py", "edit", Some("ses_1".into()), None, Some("print(2)".into()), None, None).unwrap();
        let other = append_record(
            &root,
            "report.md",
            "write",
            None,
            None,
            None,
            Some("wrote report.md".into()),
            Some(super::EnvInfo {
                python: Some("3.12.4".into()),
                platform: "macos-aarch64".into(),
                app: "0.1.0".into(),
                packages: Some(super::PackageSnapshot { count: 2, hash: "abc123".into() }),
            }),
        )
        .unwrap();
        assert_eq!((r1.version, r2.version, other.version), (1, 2, 1));

        let v = versions_for(&root, "fig/plot.py").unwrap();
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].content.as_deref(), Some("print(1)"));
        assert_eq!(v[1].tool, "edit");
        assert_eq!(v[1].session_id.as_deref(), Some("ses_1"));
        assert!(v[1].ts > 0);
        // env round-trips (and its absence stays absent).
        assert!(v[0].env.is_none());
        let report = versions_for(&root, "report.md").unwrap();
        let env = report[0].env.as_ref().expect("env recorded");
        assert_eq!(env.python.as_deref(), Some("3.12.4"));
        assert_eq!(env.platform, "macos-aarch64");
        assert_eq!(env.app, "0.1.0");
        let pkgs = env.packages.as_ref().expect("packages recorded");
        assert_eq!((pkgs.count, pkgs.hash.as_str()), (2, "abc123"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn lockfile_is_content_addressed_and_deduped() {
        use super::{content_hash, write_lockfile};
        let root = temp_root("lockfile");
        let freeze = "numpy==2.0.1\npandas==2.2.2\n\nscipy==1.14.0\n";
        let s1 = write_lockfile(&root, freeze).unwrap();
        // Blank lines are not counted as packages.
        assert_eq!(s1.count, 3);
        assert_eq!(s1.hash, content_hash(freeze)); // deterministic addressing
        let lock = root.join(".openscience/env").join(format!("{}.txt", s1.hash));
        assert_eq!(std::fs::read_to_string(&lock).unwrap(), freeze);

        // Same environment -> same hash, no duplicate file rewrite.
        let s2 = write_lockfile(&root, freeze).unwrap();
        assert_eq!(s2.hash, s1.hash);
        // A different environment -> a different lockfile.
        let s3 = write_lockfile(&root, "numpy==2.0.1\n").unwrap();
        assert_ne!(s3.hash, s1.hash);
        assert_eq!(s3.count, 1);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn absolute_paths_normalize_and_escapes_are_rejected() {
        let root = temp_root("norm");
        // Absolute path under the workspace → same key as the relative form.
        let abs = root.join("a/b.txt");
        append_record(&root, abs.to_str().unwrap(), "write", None, None, None, None, None).unwrap();
        let v = versions_for(&root, "a/b.txt").unwrap();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].path, "a/b.txt");

        assert!(normalize_rel(&root, "../outside.txt").is_err());
        assert!(normalize_rel(&root, "/etc/hosts").is_err());
        assert!(normalize_rel(&root, "").is_err());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn corrupt_lines_are_skipped_and_content_is_capped() {
        let root = temp_root("corrupt");
        append_record(&root, "x.py", "write", None, None, None, None, None).unwrap();
        // A corrupt line must not lose the rest of the history.
        use std::io::Write;
        let file = root.join(".openscience/provenance.jsonl");
        let mut f = std::fs::OpenOptions::new().append(true).open(&file).unwrap();
        writeln!(f, "not json").unwrap();
        append_record(&root, "x.py", "write", None, None, None, None, None).unwrap();
        let v = versions_for(&root, "x.py").unwrap();
        assert_eq!(v.iter().map(|r| r.version).collect::<Vec<_>>(), vec![1, 2]);

        let big = "é".repeat(CONTENT_CAP); // multi-byte: cap must respect char boundaries
        let capped = cap_content(big);
        assert!(capped.len() <= CONTENT_CAP + 20);
        assert!(capped.ends_with("[truncated]"));

        let _ = std::fs::remove_dir_all(root);
    }
}
