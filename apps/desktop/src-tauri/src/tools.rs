// Detects which scientific/runtime tools are available on the user's system.
// AI4S Workbench does not bundle Python/R/Jupyter; OpenCode's shell tool uses whatever
// is installed. This surfaces that to the UI honestly.
use serde::Serialize;

#[derive(Serialize)]
pub struct ToolStatus {
    name: String,
    found: bool,
    version: Option<String>,
}

fn probe(name: &str, bin: &str, version_arg: &str) -> ToolStatus {
    // Search the SAME enriched PATH the kernel and the agent's shell run
    // under — a Finder-launched app has a minimal PATH, and probing with it
    // misreported the user's anaconda/homebrew tools as missing.
    #[cfg(unix)]
    let path = Some(crate::runtime::enriched_path());
    #[cfg(not(unix))]
    let path: Option<String> = None;
    probe_with_path(name, bin, version_arg, path.as_deref())
}

fn probe_with_path(name: &str, bin: &str, version_arg: &str, path: Option<&str>) -> ToolStatus {
    let mut cmd = crate::runtime::quiet_command(bin);
    cmd.arg(version_arg);
    if let Some(p) = path {
        cmd.env("PATH", p);
    }
    let out = cmd.output();
    match out {
        // `--version` must succeed — the Windows Store python alias runs,
        // prints an install hint, and exits non-zero; output alone is not
        // evidence the tool is installed.
        Ok(o) if o.status.success() => {
            let text = if !o.stdout.is_empty() { o.stdout } else { o.stderr };
            let version = String::from_utf8_lossy(&text)
                .lines()
                .next()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            ToolStatus { name: name.to_string(), found: true, version }
        }
        _ => ToolStatus { name: name.to_string(), found: false, version: None },
    }
}

/// Stata lives outside PATH (an .app bundle / Program Files folder) and can't
/// be probed by running it — console mode hangs interactive and batch mode
/// drops log files as a side effect. Presence is detected by checking the
/// known install locations; the report names the edition and where it is.
fn probe_stata() -> ToolStatus {
    let found = find_stata();
    ToolStatus { name: "Stata".to_string(), found: found.is_some(), version: found }
}

/// Editions in preference order — MP is the license people actually run.
const STATA_EDITIONS: [&str; 4] = ["MP", "SE", "BE", "IC"];

#[cfg(target_os = "macos")]
pub(crate) fn find_stata() -> Option<String> {
    find_stata_under(std::path::Path::new("/Applications")).or_else(spotlight_stata)
}

/// Fallback for installs outside /Applications (external drive, custom
/// folder): ask Spotlight for the app bundle by name instead of walking the
/// disk. Runs only when the standard location misses.
#[cfg(target_os = "macos")]
fn spotlight_stata() -> Option<String> {
    let out = std::process::Command::new("mdfind")
        .arg("kMDItemFSName == 'Stata*.app'")
        .output()
        .ok()?;
    parse_stata_app_paths(&String::from_utf8_lossy(&out.stdout))
}

/// Pick the best "…/Stata<EDITION>.app" line: prefer MP > SE > BE > IC,
/// newest-looking path last as a tie-break. Pure so it can be unit-tested.
#[cfg(any(target_os = "macos", test))]
fn parse_stata_app_paths(text: &str) -> Option<String> {
    let mut lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|l| l.ends_with(".app") && !l.contains("/Backups") && !l.contains("/.Trash"))
        .collect();
    lines.sort();
    for edition in STATA_EDITIONS {
        for line in lines.iter().rev() {
            let stem = std::path::Path::new(line).file_stem()?.to_string_lossy().to_string();
            if stem == format!("Stata{edition}") {
                let parent = std::path::Path::new(line).parent()?;
                return Some(format!("Stata{edition} ({})", parent.display()));
            }
        }
    }
    None
}

/// macOS layout: /Applications/Stata*/Stata<EDITION>.app (the folder holds the
/// app plus ado/docs). Newest folder wins when several versions coexist.
#[cfg(any(target_os = "macos", test))]
fn find_stata_under(base: &std::path::Path) -> Option<String> {
    let mut dirs: Vec<std::path::PathBuf> = std::fs::read_dir(base)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy().starts_with("Stata"))
                .unwrap_or(false)
        })
        .collect();
    dirs.sort();
    for dir in dirs.iter().rev() {
        for edition in STATA_EDITIONS {
            if dir.join(format!("Stata{edition}.app")).exists() {
                return Some(format!("Stata{edition} ({})", dir.display()));
            }
        }
    }
    None
}

/// Windows installs are NOT always under C:\Program Files — a second drive
/// (D:\Stata18) is common. Check Program Files on every existing drive, then
/// each drive's root for a top-level Stata* folder. Shallow scans only.
#[cfg(windows)]
pub(crate) fn find_stata() -> Option<String> {
    let mut bases: Vec<std::path::PathBuf> = Vec::new();
    for letter in b'C'..=b'Z' {
        let root = std::path::PathBuf::from(format!("{}:\\", letter as char));
        if !root.exists() {
            continue;
        }
        bases.push(root.join("Program Files"));
        bases.push(root.join("Program Files (x86)"));
        bases.push(root);
    }
    for base in bases {
        let Ok(entries) = std::fs::read_dir(&base) else { continue };
        // Folder match is case-INSENSITIVE ("stata17", "STATA18", "StataNow19"
        // are all real-world layouts) — this is a hint scan, never a verdict.
        let mut dirs: Vec<std::path::PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .map(|n| n.to_string_lossy().to_lowercase().contains("stata"))
                    .unwrap_or(false)
            })
            .collect();
        dirs.sort();
        for dir in dirs.iter().rev() {
            // Edition-named executables first, for the pretty label…
            for edition in STATA_EDITIONS {
                for exe in [format!("Stata{edition}-64.exe"), format!("Stata{edition}.exe")] {
                    if dir.join(&exe).exists() {
                        return Some(format!("Stata{edition} ({})", dir.display()));
                    }
                }
            }
            // …then the same rule the bridge's own finder uses: any .exe whose
            // name contains "stata" counts. Repacks and renamed binaries are
            // common; a rigid four-name list was declaring real installs absent.
            let Ok(files) = std::fs::read_dir(dir) else { continue };
            for f in files.filter_map(|e| e.ok()) {
                let name = f.file_name().to_string_lossy().to_lowercase();
                if name.ends_with(".exe") && name.contains("stata") && f.path().is_file() {
                    return Some(format!("Stata ({})", dir.display()));
                }
            }
        }
    }
    None
}

#[cfg(all(unix, not(target_os = "macos")))]
pub(crate) fn find_stata() -> Option<String> {
    let mut dirs: Vec<std::path::PathBuf> = std::fs::read_dir("/usr/local")
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .map(|n| n.to_string_lossy().starts_with("stata"))
                .unwrap_or(false)
        })
        .collect();
    dirs.sort();
    for dir in dirs.iter().rev() {
        for (bin, edition) in [("stata-mp", "MP"), ("stata-se", "SE"), ("stata", "BE")] {
            if dir.join(bin).exists() {
                return Some(format!("Stata{edition} ({})", dir.display()));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    // Spotlight fallback: the best edition wins over path order, junk lines
    // (Trash, backups, non-.app) are ignored, absence returns None.
    #[test]
    fn spotlight_parse_prefers_the_best_edition_and_skips_junk() {
        let text = "/Volumes/Ext/Stata18/StataSE.app\n\
                    /Users/x/.Trash/StataMP.app\n\
                    /D/Custom/Stata17/StataMP.app\n\
                    not-an-app\n";
        assert_eq!(
            parse_stata_app_paths(text),
            Some("StataMP (/D/Custom/Stata17)".to_string())
        );
        assert_eq!(parse_stata_app_paths("nothing here\n"), None);
    }

    // A Finder-launched app has a minimal PATH, so probing with the plain
    // environment misreported the user's anaconda/homebrew tools as missing —
    // detection must search the SAME enriched PATH the kernel and agent use.
    #[cfg(unix)]
    #[test]
    fn probe_searches_the_given_path() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("os-tools-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let tool = dir.join("mytool");
        std::fs::write(&tool, "#!/bin/sh\necho mytool 9.9\n").unwrap();
        std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o755)).unwrap();

        let found = probe_with_path("MyTool", "mytool", "--version", dir.to_str());
        assert!(found.found, "tool on the provided PATH must be found");
        assert_eq!(found.version.as_deref(), Some("mytool 9.9"));

        let missing = probe_with_path("MyTool", "mytool", "--version", Some("/nonexistent-dir"));
        assert!(!missing.found, "tool off the provided PATH must not be found");

        let _ = std::fs::remove_dir_all(&dir);
    }

    // Stata never sits on PATH — detection walks the platform install dirs,
    // prefers the newest Stata folder, and reports the edition it found.
    #[test]
    fn stata_found_by_install_layout_newest_folder_wins() {
        let base = std::env::temp_dir().join(format!("os-stata-{}", std::process::id()));
        let old = base.join("Stata17");
        let new = base.join("Stata19");
        std::fs::create_dir_all(old.join("StataSE.app")).unwrap();
        std::fs::create_dir_all(new.join("StataMP.app")).unwrap();

        let found = find_stata_under(&base).expect("an installed Stata must be found");
        assert!(found.starts_with("StataMP"), "newest folder's edition wins: {found}");
        assert!(found.contains("Stata19"));

        let empty = std::env::temp_dir().join(format!("os-stata-none-{}", std::process::id()));
        std::fs::create_dir_all(&empty).unwrap();
        assert!(find_stata_under(&empty).is_none(), "no Stata folder → not found");

        let _ = std::fs::remove_dir_all(&base);
        let _ = std::fs::remove_dir_all(&empty);
    }

    // The Windows Store `python.exe` alias prints an install hint and exits
    // non-zero — output alone must not count as "found".
    #[cfg(unix)]
    #[test]
    fn probe_rejects_a_tool_that_fails_version() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("os-tools-fake-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let tool = dir.join("faketool");
        std::fs::write(&tool, "#!/bin/sh\necho 'not really installed' >&2\nexit 9\n").unwrap();
        std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o755)).unwrap();

        let status = probe_with_path("FakeTool", "faketool", "--version", dir.to_str());
        assert!(!status.found, "a tool that exits non-zero on --version must not be found");

        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// Report availability of the tools relevant to a research workflow. `async`:
/// six serial process probes take seconds on Windows and ran on the UI thread
/// at startup — a big part of the "app is sluggish right after opening" bug.
#[tauri::command(async)]
pub fn detect_tools() -> Vec<ToolStatus> {
    let python = {
        let p3 = probe("Python", "python3", "--version");
        if p3.found { p3 } else { probe("Python", "python", "--version") }
    };
    vec![
        python,
        probe("R", "Rscript", "--version"),
        probe_stata(),
        probe("Node.js", "node", "--version"),
        probe("uv", "uv", "--version"),
        probe("Jupyter", "jupyter", "--version"),
        probe("Git", "git", "--version"),
    ]
}
