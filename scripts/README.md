# scripts

Repo tooling.

- `release/` — packaging and release scripts:
  - `release.sh` — local macOS-only build+sign sanity check. The real
    multi-platform release is CI (`.github/workflows/build.yml`) on a
    `v*` tag push; see the script's header before using it.
  - `publish-shell.sh` — syncs the open-core SHELL subset of this private
    repo to the public repo (default `Lambenthan/fishes`), replacing manual
    "remember to delete these folders" discipline with an allowlist +
    verification pass (proprietary-name scan, structural checks that
    `runtime/agents`/`runtime/plugins` carry only their placeholder,
    tauri.conf.json resource-path integrity, frontend static-import
    integrity). Dry-run by default; `--push` publishes to a fresh orphan
    review branch, never straight to `main`.
- `dev/` — local development helpers (bootstrap, run the app, seed the demo workspace).
