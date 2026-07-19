// Appends frontend diagnostics to <app-data>/debug.log so we can see what the
// webview experiences (connection attempts, SSE events, errors) in packaged builds.
// Defense-in-depth: every line is redacted of key-like tokens before it is
// written, and the file is owner-only — so even a careless future log call can
// never spill a provider key into a file that ends up in a bug report.
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// Replace anything that looks like a secret with `‹redacted›`: provider key
/// prefixes (`sk-…`, `sk-ant-…`, `ghp_…`, etc.) and long opaque hex/base64
/// runs. Deliberately eager — a false positive costs a log line's readability,
/// a false negative leaks a credential.
fn redact(msg: &str) -> String {
    let mut out = String::with_capacity(msg.len());
    for token in msg.split_inclusive(char::is_whitespace) {
        let (word, trail) = token
            .find(char::is_whitespace)
            .map(|i| token.split_at(i))
            .unwrap_or((token, ""));
        out.push_str(if looks_secret(word) { "‹redacted›" } else { word });
        out.push_str(trail);
    }
    out
}

/// A token that reads as a credential: a known key prefix, or a long
/// uninterrupted run of token-body characters. The blob test deliberately
/// excludes `/`, `:`, and `.` so it never touches paths or URLs — which ARE
/// the log's normal content — only opaque secret bodies.
fn looks_secret(word: &str) -> bool {
    const PREFIXES: &[&str] = &["sk-", "sk_", "pk-", "ghp_", "gho_", "github_pat_", "xoxb-", "Bearer"];
    if PREFIXES.iter().any(|p| word.starts_with(p)) {
        return true;
    }
    // A bare high-entropy blob: >=32 chars from the token alphabet only, with a
    // digit AND a letter (so paths, URLs, and prose never trip it).
    let token_alpha = |c: char| c.is_ascii_alphanumeric() || matches!(c, '-' | '_');
    word.len() >= 32
        && word.chars().all(token_alpha)
        && word.chars().any(|c| c.is_ascii_digit())
        && word.chars().any(|c| c.is_ascii_alphabetic())
}

#[tauri::command]
pub fn log_debug(app: AppHandle, message: String) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("debug.log");
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        // Owner-only: the log may name paths and errors; keep it off other
        // accounts' reach even though keys are redacted above.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = f.set_permissions(std::fs::Permissions::from_mode(0o600));
        }
        let _ = writeln!(f, "{ts} {}", redact(&message));
    }
}

#[cfg(test)]
mod tests {
    use super::redact;

    #[test]
    fn redacts_known_key_prefixes() {
        assert_eq!(redact("connect with sk-ant-abc123XYZ"), "connect with ‹redacted›");
        assert_eq!(redact("token ghp_0123456789abcXYZ"), "token ‹redacted›");
    }

    #[test]
    fn redacts_bare_high_entropy_blobs() {
        // 40-char hex (digits + letters), whitespace-delimited → redacted.
        let hex = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f80912";
        assert_eq!(redact(&format!("key {hex}")), "key ‹redacted›");
    }

    #[test]
    fn never_redacts_paths() {
        // The log's normal content — a long workspace path — stays intact.
        let path = "/Users/researcher/Documents/Fishes/my-study/analysis_panel";
        assert_eq!(redact(&format!("wrote {path}")), format!("wrote {path}"));
    }

    #[test]
    fn keeps_ordinary_diagnostics_readable() {
        // No digits / short → left alone, so normal logs stay useful.
        assert_eq!(redact("status → connecting"), "status → connecting");
        assert_eq!(redact("event ← session.idle ses_1"), "event ← session.idle ses_1");
        assert_eq!(
            redact("connect → http://127.0.0.1:52012"),
            "connect → http://127.0.0.1:52012",
        );
    }

    #[test]
    fn preserves_whitespace_layout() {
        assert_eq!(redact("a  b\tc"), "a  b\tc");
    }
}
