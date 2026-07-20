// Built-in example runs: the REAL artifact files (figures, do-files, .qreg,
// the review PDF/Word) produced by the three transcript sessions embedded as
// examples. Opening an example materializes its folder under
// `<workspace base>/examples/<name>`, so every file card in the transcript
// opens a genuine file through the same preview path a live session uses —
// nothing in the examples is a mock-up.
use std::path::Path;
use tauri::{path::BaseDirectory, AppHandle, Manager};

use crate::runtime::base_workspace_dir;

/// Bundled example runs; the command rejects anything else.
const EXAMPLES: &[&str] = &["figure", "regression", "review"];

/// Copy `src` into `dst` recursively WITHOUT overwriting existing files — a
/// re-installed example must never clobber the user's edited copy.
fn copy_missing(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_missing(&entry.path(), &to)?;
        } else if !to.exists() {
            std::fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

/// Copy a bundled example run into `<base>/examples/<name>` (idempotent,
/// never overwrites) and return its base-relative path — the frontend opens
/// the files with root "base", exactly as it opens any other real file.
#[tauri::command(async)]
pub fn install_example(app: AppHandle, name: String) -> Result<String, String> {
    if !EXAMPLES.contains(&name.as_str()) {
        return Err(format!("unknown example: {name}"));
    }
    let src = app
        .path()
        .resolve(format!("examples/{name}"), BaseDirectory::Resource)
        .map_err(|e| format!("example resource missing: {e}"))?;
    if !src.is_dir() {
        return Err("example not bundled in this build".into());
    }
    let dst = base_workspace_dir(&app)?.join("examples").join(&name);
    copy_missing(&src, &dst).map_err(|e| format!("example install failed: {e}"))?;
    Ok(format!("examples/{name}"))
}

#[cfg(test)]
mod tests {
    use super::copy_missing;

    #[test]
    fn copies_recursively_but_never_overwrites() {
        let base = std::env::temp_dir().join(format!("ai4s-example-{}", std::process::id()));
        let src = base.join("src");
        let dst = base.join("dst");
        std::fs::create_dir_all(src.join("data")).unwrap();
        std::fs::write(src.join("README.md"), "bundled readme").unwrap();
        std::fs::write(src.join("data/x.csv"), "a,b\n1,2\n").unwrap();

        copy_missing(&src, &dst).unwrap();
        assert_eq!(std::fs::read_to_string(dst.join("data/x.csv")).unwrap(), "a,b\n1,2\n");

        // The user edits a file; re-installing must keep the edit.
        std::fs::write(dst.join("README.md"), "user edited").unwrap();
        copy_missing(&src, &dst).unwrap();
        assert_eq!(std::fs::read_to_string(dst.join("README.md")).unwrap(), "user edited");

        let _ = std::fs::remove_dir_all(base);
    }
}
