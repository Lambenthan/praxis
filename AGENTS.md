# Fishes (desktop)

Brand name: **Fishes** — "An AI workbench for social-science research. Your
partner from question to submission." Everything is Fishes: bundle identifier
`com.fishes.app`, Rust crate `fishes` (lib `fishes_lib`), and the `@fishes/*`
workspace packages. (The one intentional exception is the bundled
`ai4s-skills` pack — that is an external asset's own name, fetched by URL in
`scripts/dev/fetch-skills.sh`, not the app's brand.) Forked from the MIT
`open-science` base; that lineage is recorded in `UPSTREAM_FREEZE.txt`, this
is the product's own brand.

Project rules and working context for AI agents (Claude Code, Cursor, Codex, etc.).
`CLAUDE.md` is a symlink to this file — edit only `AGENTS.md`.

## Design principles

Keep it **simple, explicit, clear, complete**.

- **Simple** — no over-engineering; if not necessary, do not add entities.
- **Explicit** — no ambiguity; no bugs.
- **Clear** — understandable at a glance.
- **Complete** — cover the key points; prioritize safety.

## What this project is

An open-source, local-first, model-agnostic, reproducible AI research workbench
for macOS and Windows. See `README.md`, `docs/PRD.md`, and `docs/TECHNICAL_DESIGN.md`.

Recommended stack: **Tauri 2 + React + TypeScript + Vite**, Tailwind + Radix UI,
**OpenCode** as the agent runtime (bundled single-binary sidecar; HTTP + SSE API),
local workspace + SQLite + JSONL provenance.

## Repository map

- `apps/desktop/` — Tauri + React desktop shell (`src/` frontend, `src-tauri/` Rust).
- `packages/` — `ui`, `shared`, `sdk` (the `OpenCodeClient` wrapper).
- `runtime/` — `manager`, `opencode-profile`, `mcp`, `skills`.
- `docs/` — product and technical specs.
- `examples/bci-trends/` — the built-in demo project.
- `scripts/` — release and dev scripts.

## Architecture guardrails

- The UI never calls OpenCode directly — it goes through `packages/sdk` (`OpenCodeClient`).
  Pin the OpenCode version (see `OPENCODE_VERSION`) and bundle it as a sidecar.
- Keep the frontend, desktop shell, and agent runtime decoupled.
- Skills, MCP servers, and model providers must stay pluggable.
- Keep the artifact schema and workflow templates stable and versioned.

## Safety defaults (non-negotiable for the desktop)

- The agent may only access the current workspace.
- Command execution, file deletion, dependency install, and remote connections
  require approval (manual approval mode by default — never ship `off`).
- API keys are stored **locally, in an owner-only app-private file** (the
  OpenCode profile under the app data dir; dir `0700`, file `0600` — see
  `runtime.rs::tighten_private`). They never go into the workspace, provenance,
  logs (redacted — `debug_log.rs::redact`), crash reports, git, or exported
  projects. (OS-keychain storage is a possible future hardening, not yet done —
  do not claim it.)

## UI changes

Any change that touches user-facing UI must pass the checklist in
`docs/DESIGN_GUIDELINES.md` (distilled from HIG / Fluent / Material /
Ant Design / GOV.UK / NN/g, with sources). Non-negotiables: verified-not-saved
connection status, error text = what happened + how to fix, no pre-disabled
primary buttons, no color-only errors, CJK line-height ≥ 1.5, one accent /
one radius / token-grid spacing only.

### Layout guardrails (added 2026-07-18 after real regressions — all four bit the user)

- **Every side pane is user-resizable**: drag edge + width persisted to
  localStorage + min/max clamp (`features/library/ResizeEdge.tsx` is the
  reusable pair; `RightPane` predates it). No new fixed-width pane.
- **No fixed-width table/grid columns that can overlap.** A pane squeezed by
  its neighbors must adapt: measure with ResizeObserver and drop secondary
  columns below the min width (see LibraryView's `compact`). If text can
  collide, the layout is wrong.
- **Failures must be visible where the user is looking.** Every async turn
  needs an error path that renders the SPECIFIC reason in the surface itself
  (red status-line), including after thread rebuilds; a turn may never end in
  silence (see the silent-turn fallback in `runtime.ts`).
- **Forms**: inputs are white (`bg-surface`) with `border-border` — never
  gray-on-gray; exactly one primary action per pane and it uses the accent.
- **Copy is plain and restrained** (科研工具): "Generate wiki", never
  "one-click ✨" marketing tone.

### Dev workflow

Iterate in `tauri dev` (frontend HMR is instant; Rust is an incremental debug
build). Package a release bundle ONLY when the user asks to ship; after
installing, delete the bundle copy under `target/release/bundle/` so exactly
one app exists on the machine. If HMR seems dead, check the vite process is
still alive before debugging the code.

## Working conventions

- Default working language for discussion is Chinese; **all project files and
  code are in English** (this is a pure-English project).
- One progress file: `PROGRESS.md`. Append one line per real milestone,
  `YYYY-MM-DD HH:MM` + a one-sentence conclusion, newest on top. Results and
  blockers only.
- Avoid adding new Markdown docs unless requested — too many docs become debt.
- Prefer minimal, verifiable changes; every step should produce a checkable result.
- Do not write inferences as verified facts; tie conclusions to code or data.
