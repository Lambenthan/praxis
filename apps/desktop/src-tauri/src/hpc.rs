// HPC / Slurm over SSH (P2-2). The app talks to the user's cluster with the
// system `ssh` binary and the user's own SSH config/keys — no credentials of
// our own, no agent on the cluster. Rust side: pick a host, probe it for
// Slurm, list/cancel the user's queued jobs. Submission itself is agent-driven
// via the bundled `hpc-slurm` skill; the chosen host is shared with the agent
// through <workspace>/.openscience/hpc.json.
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

use crate::runtime::workspace_dir;

const CONFIG_FILE: &str = "hpc.json";

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct HpcCheck {
    /// SSH connection succeeded (regardless of whether Slurm is present).
    pub reachable: bool,
    /// First line of `sbatch --version` when Slurm is available.
    pub slurm: Option<String>,
    /// Human-readable detail for failures / missing Slurm.
    pub message: Option<String>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct HpcJob {
    pub id: String,
    pub state: String,
    pub time: String,
    pub partition: String,
    pub name: String,
}

/// `user@host` or `host` made only of safe characters. Rejects anything that
/// could smuggle an ssh option (leading `-`) or shell metacharacters.
fn is_safe_host(host: &str) -> bool {
    let rest = host.split_once('@').map(|(u, h)| {
        (!u.is_empty() && u.chars().all(is_host_char)).then_some(h)
    });
    let host_part = match rest {
        Some(Some(h)) => h,
        Some(None) => return false,
        None => host,
    };
    !host_part.is_empty()
        && !host_part.starts_with('-')
        && host_part.chars().all(is_host_char)
}

fn is_host_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+')
}

/// A Slurm job id as squeue %i prints it: `123`, array forms `123_4` /
/// `123_[0-15]` / `123_[0-15%4]`, het-job forms `123+0`.
fn is_safe_job_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_digit() || matches!(c, '_' | '[' | ']' | '-' | '+' | ',' | '%'))
}

/// Host aliases from an ssh config, in file order, wildcard patterns skipped.
fn parse_ssh_hosts(text: &str) -> Vec<String> {
    let mut hosts = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        let mut words = line.split_whitespace();
        if !words.next().is_some_and(|w| w.eq_ignore_ascii_case("host")) {
            continue;
        }
        for alias in words {
            if alias.starts_with('#') {
                break; // rest of the line is a comment
            }
            if alias.contains(['*', '?', '!']) {
                continue;
            }
            // Never suggest an alias the connect path would reject.
            if !is_safe_host(alias) {
                continue;
            }
            let alias = alias.to_string();
            if !hosts.contains(&alias) {
                hosts.push(alias);
            }
        }
    }
    hosts
}

/// Host aliases from the user's `~/.ssh/config` (candidates for the picker —
/// the UI also accepts a free-form `user@host`).
#[tauri::command]
pub fn list_ssh_hosts(app: AppHandle) -> Result<Vec<String>, String> {
    let path = app.path().home_dir().map_err(|e| e.to_string())?.join(".ssh").join("config");
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(parse_ssh_hosts(&text)),
        Err(_) => Ok(Vec::new()), // no ssh config is a normal state
    }
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(workspace_dir(app)?.join(".openscience").join(CONFIG_FILE))
}

/// The configured cluster host, if any (shared with the agent via hpc.json).
#[tauri::command]
pub fn hpc_config(app: AppHandle) -> Result<Option<String>, String> {
    let path = config_path(&app)?;
    let Ok(text) = std::fs::read_to_string(path) else { return Ok(None) };
    let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(v.get("host").and_then(|h| h.as_str()).map(str::to_string))
}

/// Persist (or clear, with None/empty) the cluster host into
/// `<workspace>/.openscience/hpc.json`, where the hpc-slurm skill reads it.
#[tauri::command]
pub fn set_hpc_config(app: AppHandle, host: Option<String>) -> Result<(), String> {
    let path = config_path(&app)?;
    let host = host.unwrap_or_default();
    if host.is_empty() {
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    if !is_safe_host(&host) {
        return Err("invalid host".into());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let body = serde_json::json!({ "host": host }).to_string();
    std::fs::write(&path, body).map_err(|e| e.to_string())
}

/// Run one non-interactive command on the host via the system ssh, with the
/// user's own keys/config. Returns (exit code, stdout, stderr).
async fn run_ssh(app: &AppHandle, host: &str, command: &str) -> Result<(i32, String, String), String> {
    if !is_safe_host(host) {
        return Err("invalid host".into());
    }
    let out = app
        .shell()
        .command("ssh")
        .args([
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=8",
            // Never trust an unknown host key on the app's behalf (safety
            // default: remote connections need the user's approval) — the
            // user verifies the fingerprint once in their own terminal.
            "-o", "StrictHostKeyChecking=yes",
            "--", host, command,
        ])
        .output()
        .await
        .map_err(|e| format!("ssh failed to run: {e}"))?;
    Ok((
        out.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&out.stdout).to_string(),
        String::from_utf8_lossy(&out.stderr).to_string(),
    ))
}

/// Probe the host: is it reachable over SSH, and does it have Slurm?
#[tauri::command]
pub async fn hpc_check(app: AppHandle, host: String) -> Result<HpcCheck, String> {
    let (code, stdout, stderr) = run_ssh(&app, &host, "sbatch --version").await?;
    if code == 0 {
        let version = stdout.lines().next().unwrap_or("slurm").trim().to_string();
        return Ok(HpcCheck { reachable: true, slurm: Some(version), message: None });
    }
    // ssh itself reports failures (auth, DNS, timeout) with exit 255.
    if code == 255 {
        let mut detail = stderr.lines().last().unwrap_or("connection failed").trim().to_string();
        if stderr.contains("Host key verification failed") {
            detail = format!(
                "host key not verified — run `ssh {host}` once in your terminal to check \
                 and accept its fingerprint, then retry"
            );
        }
        return Ok(HpcCheck { reachable: false, slurm: None, message: Some(detail) });
    }
    Ok(HpcCheck {
        reachable: true,
        slurm: None,
        message: Some(format!("connected, but `sbatch` was not found on {host}")),
    })
}

/// Parse `squeue -h -o '%i|%T|%M|%P|%j'` output (name last — it may contain
/// separators; the tail is swallowed into it).
fn parse_squeue(stdout: &str) -> Vec<HpcJob> {
    stdout
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            let mut f = line.splitn(5, '|');
            Some(HpcJob {
                id: f.next()?.trim().to_string(),
                state: f.next()?.trim().to_string(),
                time: f.next()?.trim().to_string(),
                partition: f.next()?.trim().to_string(),
                name: f.next()?.trim().to_string(),
            })
        })
        .collect()
}

/// The user's queued/running jobs on the host.
#[tauri::command]
pub async fn hpc_jobs(app: AppHandle, host: String) -> Result<Vec<HpcJob>, String> {
    // `-u "$USER"` (expanded on the cluster), not `--me` — the latter needs
    // Slurm >= 20.02 and errors on older clusters.
    let (code, stdout, stderr) =
        run_ssh(&app, &host, "squeue -u \"$USER\" -h -o '%i|%T|%M|%P|%j'").await?;
    if code != 0 {
        let detail = stderr.lines().last().unwrap_or("squeue failed").trim();
        return Err(detail.to_string());
    }
    Ok(parse_squeue(&stdout))
}

/// Cancel one of the user's jobs.
#[tauri::command]
pub async fn hpc_cancel(app: AppHandle, host: String, job_id: String) -> Result<(), String> {
    if !is_safe_job_id(&job_id) {
        return Err("invalid job id".into());
    }
    // Single-quoted for the remote shell: array ids contain glob chars ([ ]).
    let (code, _, stderr) = run_ssh(&app, &host, &format!("scancel '{job_id}'")).await?;
    if code != 0 {
        return Err(stderr.lines().last().unwrap_or("scancel failed").trim().to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_safe_host, is_safe_job_id, parse_squeue, parse_ssh_hosts};

    #[test]
    fn parses_hosts_and_skips_wildcards() {
        let cfg = "
Host *
    ServerAliveInterval 60

Host login  # HPC login node
Host cluster-a cluster-b
    HostName a.example.org
host lowercase
Host bad-* good.host
Host gpu+login \"quoted alias\"
";
        // Aliases the connect path would reject (is_safe_host) are not suggested.
        assert_eq!(
            parse_ssh_hosts(cfg),
            vec!["login", "cluster-a", "cluster-b", "lowercase", "good.host", "gpu+login"]
        );
    }

    #[test]
    fn dedupes_repeated_aliases() {
        assert_eq!(parse_ssh_hosts("Host a\nHost a b"), vec!["a", "b"]);
    }

    #[test]
    fn accepts_real_hosts_rejects_injection() {
        assert!(is_safe_host("login.hpc.edu"));
        assert!(is_safe_host("alice@10.0.0.7"));
        assert!(is_safe_host("cluster-a_1"));
        assert!(is_safe_host("gpu+login"));
        assert!(!is_safe_host(""));
        assert!(!is_safe_host("-oProxyCommand=evil"));
        assert!(!is_safe_host("alice@-evil"));
        assert!(!is_safe_host("host; rm -rf /"));
        assert!(!is_safe_host("host cmd"));
        assert!(!is_safe_host("@host"));
        assert!(!is_safe_host("a@b@c"));
    }

    #[test]
    fn job_id_validation() {
        assert!(is_safe_job_id("12345"));
        assert!(is_safe_job_id("123_4"));
        assert!(is_safe_job_id("123_[0-15]")); // pending array, as squeue prints it
        assert!(is_safe_job_id("123_[0-15%4]")); // array with throttle
        assert!(is_safe_job_id("123+0")); // heterogeneous job component
        assert!(!is_safe_job_id(""));
        assert!(!is_safe_job_id("123 456"));
        assert!(!is_safe_job_id("123;true"));
        assert!(!is_safe_job_id("123'true"));
    }

    #[test]
    fn parses_squeue_lines_name_last() {
        let jobs = parse_squeue("42|RUNNING|1:23|gpu|fit model|stage 2\n43|PENDING|0:00|cpu|sim\n\n");
        assert_eq!(jobs.len(), 2);
        assert_eq!(jobs[0].id, "42");
        assert_eq!(jobs[0].state, "RUNNING");
        assert_eq!(jobs[0].partition, "gpu");
        assert_eq!(jobs[0].name, "fit model|stage 2");
        assert_eq!(jobs[1].state, "PENDING");
    }
}
