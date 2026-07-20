<div align="center">

<img src="./apps/desktop/src/assets/fishes-mark.svg" width="88" alt="Fishes" />

# Fishes

**An AI workbench for social-science research.**

A local-first, model-agnostic desktop app for quantitative, qualitative, and
mixed-methods work. It proposes regression models you adjudicate into a final
table, produces publication-grade figures, codes transcripts into candidates you
accept or reject, and compiles manuscripts to journal PDF and Word. Results are
saved as files in your workspace, and the app documents how your data is handled.

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

## Download

**Windows** — download an installer and run it:

| Installer | When to use |
|---|---|
| **[`Fishes_0.3.0_x64-setup.exe`](https://github.com/Lambenthan/fishes/releases/download/v0.3.0/Fishes_0.3.0_x64-setup.exe)** ✅ **recommended** | Most users. One-click install, smaller, auto-updates. |
| [`Fishes_0.3.0_x64_en-US.msi`](https://github.com/Lambenthan/fishes/releases/download/v0.3.0/Fishes_0.3.0_x64_en-US.msi) | Alternative — MSI-based / managed deployment. |

Most people should just download the **`.exe`**. All builds live on the
[**Releases**](https://github.com/Lambenthan/fishes/releases/latest) page.

**macOS (Apple Silicon)** — download the DMG, open it, and drag Fishes to Applications:

[`Fishes_0.3.0_aarch64.dmg`](https://github.com/Lambenthan/fishes/releases/download/v0.3.0/Fishes_0.3.0_aarch64.dmg)

The macOS build is not notarized by Apple yet, so the **first** launch is blocked by Gatekeeper (it is safe — there is just no paid Apple signature). Allow it once:

1. Double-click Fishes; on the warning, click **Done** (do not move it to Trash).
2. Open **System Settings → Privacy & Security**, scroll to **Security**, and next to "Fishes was blocked…" click **Open Anyway**.
3. Enter your login password and click **Open**. From then on it opens normally with a double-click.

_(Alternative — one command in Terminal: `xattr -cr /Applications/Fishes.app`, then double-click. Right-clicking "Open" no longer bypasses this on recent macOS. Intel Macs: build from source for now.)_

After install, Fishes guides you to connect one model key (**DeepSeek**
recommended — low cost, reachable in China) and you are ready. Stata is optional.

## Contents

- [Download](#download)
- [Who it is for](#who-it-is-for)
- [What it does](#what-it-does)
- [How your data is handled](#how-your-data-is-handled)
- [Open-core: what is in this repo](#open-core-what-is-in-this-repo)
- [How it works](#how-it-works)
- [Build from source](#build-from-source)
- [Repository layout](#repository-layout)
- [Updating](#updating)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## Who it is for

Social-science researchers who want an AI research assistant without setting up a
terminal, a coding agent, or an API integration. Fishes installs like any desktop
app. You paste one model key, and it guides the work — quantitative, qualitative,
or mixed methods.

## What it does

Fishes is organised around the three research lanes, and around the researcher
making the decisions.

- **Quantitative.** It runs a data check, a baseline model menu (OLS, clustered
  standard errors, fixed effects), and robustness checks, then presents the models
  as candidates. You choose which ones enter the final table. Each number traces to
  a runnable do-file. Figures use a plain publication style: white ground, labelled
  axes, one palette.
- **Qualitative.** It open-codes a transcript into candidate codes you accept or
  reject, and exports to REFI-QDA (`.qdpx`) for NVivo and MAXQDA.
- **Writing.** It compiles a review or paper to a journal PDF (LaTeX) and a journal
  Word document, in Chinese social-science or APA format, from one manuscript.

Results are saved as files in the workspace. When a turn finishes, the relevant
file opens next to the conversation.

## How your data is handled

The shell is open source so these statements can be checked in the code. Each row
names the file that implements it.

| Statement | Where to check it |
|---|---|
| Your files and raw data stay on your machine. The agent runs inside the workspace folder you chose, not your filesystem root. | `src-tauri/src/runtime.rs` — `spawn_sidecar` sets `current_dir(workspace)` |
| Provider keys are stored locally, in an owner-only file (directory `0700`, file `0600`). They are not written to the workspace, provenance, or exports. | `src-tauri/src/runtime.rs` — `tighten_private`; `src-tauri/src/opencode_config.rs` |
| Keys are redacted from the debug log, and the log is owner-only. | `src-tauri/src/debug_log.rs` — `redact` |
| There is no telemetry, analytics, or background reporting. Data leaves only during a conversation turn. | grep the tree: no `posthog` / `sentry` / `analytics` |
| The agent runtime binds `127.0.0.1` and requires a password generated fresh each launch and held in memory. A local web page scanning ports cannot drive it or read the keys. | `src-tauri/src/runtime.rs` — `server_password`, `spawn_sidecar` |
| Deleting files, installing dependencies, remote connections, and web fetches require approval. The app ships in manual-approval mode. | `src-tauri/src/opencode_config.rs` — `DANGEROUS_BASH`, `approve_permission` |
| The only data sent off the machine is the request to the model provider you chose, the same data that provider's own website would receive. Optional science connectors run only if you enable them. | `src/components/settings/DataFlowCard.tsx` |

The app restates this in plain language under **Settings → Privacy & data flow**,
kept in step with the code in the same commit as any change in behaviour.

## Open-core: what is in this repo

This repository is the shell, under the MIT license: the Tauri desktop app, the
interface, and the runtime integration layer — how keys are stored, how the agent
is sandboxed to the workspace, and what leaves the machine.

The research methodology is a separate, proprietary layer. The skills and agents
that do the annotation, the qualitative coding, the regression adjudication, the
journal formatting, and the methodology reviews ship inside the signed release and
are not in this repository.

Third-party components carry their own licenses and are fetched at build time, not
vendored here: the [OpenCode](https://opencode.ai) runtime,
[`uv`](https://github.com/astral-sh/uv), and Anthropic's document skills
(docx/pdf/pptx/xlsx, which are proprietary and may not be redistributed).

A build from this repository produces the shell. A full product build also includes
the private methodology layer.

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
   └─────────────────────  [ you adjudicate ]     the agent proposes; you adopt or
                                                  reject; every result traces to code
```

Everything runs through the bundled [OpenCode](https://opencode.ai) agent runtime,
a single pinned sidecar binary the app manages. The UI does not talk to a model
directly; it goes through a thin SDK, so skills, MCP servers, and model providers
stay pluggable.

## Build from source

> **Prerequisites:** [Node.js](https://nodejs.org) ≥ 20, [pnpm](https://pnpm.io) 9, and
> the [Rust toolchain](https://rustup.rs) (for Tauri). macOS or Windows.

```bash
git clone https://github.com/Lambenthan/fishes
cd fishes
pnpm install

# Fetch the pinned sidecars (kept out of git; they carry their own licenses):
bash scripts/dev/fetch-opencode.sh   # the OpenCode agent runtime
bash scripts/dev/fetch-uv.sh         # uv, for isolated Python/Jupyter envs

# Develop the shell, or build an installer (.dmg / .app / NSIS / .msi):
pnpm --filter @ai4s/desktop tauri dev
pnpm --filter @ai4s/desktop tauri build
```

The methodology skills are a separate private layer and are not required to build
or run the shell. On first launch the app starts the bundled runtime; the setup
guide covers connecting a model and, optionally, Stata.

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
| `packages/sdk/` | `OpenCodeClient` SDK wrapper, which isolates the UI from the runtime |
| `packages/ui/` | Shared UI component library |
| `runtime/rules/` | Global agent rules deployed to the runtime |
| `scripts/` | `release/` (signed build + updater manifest) and `dev/` (sidecar fetchers) |
| `docs/` | Install guide and connector notes |
| `runtime/skills/` | Proprietary methodology layer — present in full builds, not in this repository |

## Updating

The app checks for updates on launch. When a newer signed release exists, it offers
to update and restart. Updates are cryptographically signed; the public key is
pinned in the app and the private key does not ship. See
[`scripts/release/release.sh`](./scripts/release/release.sh) for the release flow.

## License

The shell in this repository is [MIT](./LICENSE). The methodology skills are a
separate proprietary layer, not included here. Bundled third-party components —
OpenCode, uv, and Anthropic's document skills — carry their own licenses.

> Research tooling. Outputs are drafts. Verify numbers, citations, and claims, and
> have a domain expert review before any submission or decision.

## Acknowledgments

Built on [Tauri](https://tauri.app) and [OpenCode](https://opencode.ai). Forked from
the MIT [open-science](https://github.com/ai4s-research/open-science) base; that
lineage is recorded in [`UPSTREAM_FREEZE.txt`](./UPSTREAM_FREEZE.txt).
