<div align="center">

<img src="./apps/desktop/src/assets/praxis-mark.svg" width="88" alt="Praxis" />

# Praxis

**An AI workbench for social-science research.**
Your partner from question to submission.

A **local-first**, **model-agnostic** desktop app that turns a research question into
submission-ready work — regressions you adjudicate into a final table, publication-grade
figures, qualitative coding you rule on, and manuscripts compiled to journal PDF **and**
Word. Not a chat box: a workbench where every result lands as a file you own, and where
you can read exactly how your data is handled.

<p><b>English</b> · <a href="./README.zh.md">中文</a></p>

<p>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/shell-MIT-blue.svg" alt="Shell: MIT"></a>
  <img src="https://img.shields.io/badge/model-open--core-C06A3E" alt="open-core">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey" alt="Platforms">
  <img src="https://img.shields.io/badge/built%20with-Tauri%202%20%2B%20React-24C8DB" alt="Built with Tauri + React">
  <img src="https://img.shields.io/badge/runtime-OpenCode-success" alt="OpenCode runtime">
</p>

</div>

---

## Contents

- [Who it is for](#who-it-is-for)
- [What it does](#what-it-does)
- [How your data is handled](#how-your-data-is-handled) — *and how to verify it*
- [Open-core: what is in this repo](#open-core-what-is-in-this-repo)
- [How it works](#how-it-works)
- [Build from source](#build-from-source)
- [Repository layout](#repository-layout)
- [Updating](#updating)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## Who it is for

Social-science researchers who want an AI research assistant but shouldn't have to set up
a terminal, a coding agent, or an API integration to get one. Praxis is a normal desktop
app: install it, paste one model key, and it walks you through the work — quantitative,
qualitative, or mixed methods.

## What it does

Praxis is organised around the three research lanes and, above all, around **you making
the calls**:

- **Quantitative** — hand it a dataset; it runs the data check, a baseline model menu
  (OLS → clustered SE → fixed effects) and robustness, and hands you the models as
  **candidates** in a regression adjudication table. *You* adopt the ones that make the
  final table; every number traces back to a runnable do-file. Figures come out
  publication-grade by default (white ground, labelled axes, one consistent palette).
- **Qualitative** — open-code a transcript into candidate codes you rule on one by one;
  export to REFI-QDA (`.qdpx`) for NVivo / MAXQDA.
- **Writing** — compile a review or paper to a journal **PDF** (LaTeX) and a journal
  **Word** document (Chinese social-science or APA), from the same manuscript.

Results are files in your workspace, not walls of chat text — and the one that matters
opens beside the conversation the moment a turn finishes.

> _Screenshots: add real Praxis captures to `docs/assets/` before publishing — the
> upstream images are intentionally not referenced here._

## How your data is handled

This is the reason the shell is open source: **you can read exactly how the app treats
your data, and verify each claim in the code.** Nothing below is marketing — every line
cites the file that implements it.

| Guarantee | Verify it in |
|---|---|
| **Your files and raw data stay on your machine.** The agent runs inside the workspace folder you chose, never your filesystem root. | `src-tauri/src/runtime.rs` — `spawn_sidecar` sets `current_dir(workspace)` |
| **Provider keys are stored locally, in an owner-only file** (directory `0700`, file `0600`) — never in the workspace, provenance, or exports. | `src-tauri/src/runtime.rs` — `tighten_private`; `src-tauri/src/opencode_config.rs` |
| **Keys are redacted from the debug log**, and the log itself is owner-only — a bug report can't leak a credential. | `src-tauri/src/debug_log.rs` — `redact` |
| **No telemetry, no analytics, no phone-home.** Data leaves only during a conversation turn — nothing in the background. | grep the tree: no `posthog` / `sentry` / `analytics` / `mixpanel` |
| **The agent runtime is localhost-only and password-gated.** It binds `127.0.0.1`, with a fresh random password each launch held in memory (never on disk), so a local web page scanning ports can't drive it or read your keys. | `src-tauri/src/runtime.rs` — `server_password`, `spawn_sidecar` (`--hostname 127.0.0.1`) |
| **Dangerous actions ask first.** Deleting files, installing dependencies, remote connections, and web fetches prompt for approval; the app ships in manual-approval mode. | `src-tauri/src/opencode_config.rs` — `DANGEROUS_BASH`, `approve_permission` |
| **The only thing sent off-machine is your request to the model provider you chose** — the same data you'd send using that provider's own website. Optional science connectors (literature search, FRED, …) only run if you enable them. | `src/components/settings/DataFlowCard.tsx` states this in-app |

The app also shows this in plain language under **Settings → Privacy & data flow**, kept
true to the code in the same commit as any behavior change.

## Open-core: what is in this repo

Praxis is **open-core**. The split is deliberate:

- **This repository is the shell — MIT-licensed and fully auditable.** The Tauri desktop
  app, the UI, and the runtime integration layer (how keys are stored, how the sidecar is
  launched and sandboxed, what leaves the machine). This is the part you must be able to
  trust, so it is open.
- **The research methodology is a separate, proprietary layer.** The skills and agents
  that do the annotation, the three-level qualitative coding, the regression adjudication,
  the journal formatting, and the methodology reviews are shipped inside the installer but
  are **not** in this repository. That craft is the product.
- **Third-party components carry their own licenses** and are fetched at build time, not
  vendored here: the [OpenCode](https://opencode.ai) runtime, [`uv`](https://github.com/astral-sh/uv),
  and Anthropic's document skills (docx/pdf/pptx/xlsx, which are proprietary and must not
  be redistributed).

So a build from this repo alone produces the working shell; a full product build also
pulls in the private methodology layer.

## How it works

```
your question
   │
   ▼
[ plan ] ──▶ [ approve ] ──▶ [ execute ]      Stata / local Python kernel / shell,
   ▲             ▲              │              MCP tools — all on your machine
   │             │              ▼
   │        you answer     [ results as files ]  ──▶  .qreg tables · figures · .qcode
   │       questions /          │                      coding · journal PDF + Word
   │       permissions          ▼
   └─────────────────────  [ you adjudicate ]     you adopt / reject; the agent proposes,
                                                  you decide — every result traces to code
```

Everything runs through the bundled [OpenCode](https://opencode.ai) agent runtime — a
single pinned sidecar binary the app manages. The UI never talks to a model directly; it
goes through a thin SDK, so skills, MCP servers, and model providers stay pluggable.

## Build from source

> **Prerequisites:** [Node.js](https://nodejs.org) ≥ 20, [pnpm](https://pnpm.io) 9, and
> the [Rust toolchain](https://rustup.rs) (for Tauri). macOS or Windows.

```bash
git clone https://github.com/Lambenthan/praxis
cd praxis
pnpm install

# Fetch the pinned sidecars (kept out of git; carry their own licenses):
bash scripts/dev/fetch-opencode.sh   # the OpenCode agent runtime
bash scripts/dev/fetch-uv.sh         # uv, for isolated Python/Jupyter envs

# Develop the shell, or build an installer (.dmg / .app / NSIS / .msi):
pnpm --filter @ai4s/desktop tauri dev
pnpm --filter @ai4s/desktop tauri build
```

The methodology skills live in a separate private layer and are not required to build or
run the shell. On first launch the app starts the bundled runtime automatically; the
setup guide walks you through connecting a model and (optionally) Stata.

Checks:

```bash
cd apps/desktop
npx vitest run          # unit tests
npx tsc --noEmit -p .   # TypeScript
cd src-tauri && cargo test   # Rust
```

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/desktop/` | Tauri 2 + React + TypeScript + Vite desktop shell (`src/` frontend, `src-tauri/` Rust) |
| `packages/shared/` | Shared domain types and the chart design system |
| `packages/sdk/` | `OpenCodeClient` SDK wrapper — isolates the UI from the runtime |
| `packages/ui/` | Shared UI component library |
| `runtime/rules/` | Global agent rules deployed to the runtime (results-as-files, figure standards) |
| `scripts/` | `release/` (signed build + updater manifest) and `dev/` (sidecar fetchers) |
| `docs/` | Product and technical specs, install guide |
| `runtime/skills/` | **Proprietary methodology layer** — present in full builds, excluded from the public shell |

## Updating

The app checks for updates on launch and, when a newer signed release exists, offers a
one-click **Update & restart** (or Later). Updates are cryptographically signed; the
public key is pinned in the app and the private key never ships. See
[`scripts/release/release.sh`](./scripts/release/release.sh) for the release flow.

## License

The **shell in this repository is [MIT](./LICENSE)**. The methodology skills are a
separate proprietary layer (not included here). Bundled third-party components — OpenCode,
uv, and Anthropic's document skills — carry their own licenses.

> Research tooling. Outputs are drafts — verify numbers, citations, and claims, and have a
> domain expert review before any submission or decision.

## Acknowledgments

Built on [Tauri](https://tauri.app) and [OpenCode](https://opencode.ai). Forked from the
MIT [open-science](https://github.com/ai4s-research/open-science) base; that lineage is
recorded in [`UPSTREAM_FREEZE.txt`](./UPSTREAM_FREEZE.txt).
