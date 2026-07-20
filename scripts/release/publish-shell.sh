#!/usr/bin/env bash
# Publish the open-core SHELL subset of this private repo to the public
# repo (Lambenthan/fishes) — replacing the manual "remember to delete these
# folders before pushing" process with an allowlist + verification script.
#
# Safety model: default-DENY. Only paths in ALLOW below are ever copied out
# of this repo; everything else (in particular the 21+ methodology skills
# under runtime/skills/core, the 4 agent definitions under runtime/agents,
# and runtime/plugins/research-guardrails.js) never touches the snapshot,
# so it can never enter the public repo's git history — not even briefly.
#
# Usage:
#   scripts/release/publish-shell.sh              # dry run: build + verify only
#   scripts/release/publish-shell.sh --push        # also push to a fresh
#                                                   # branch on the public repo
#
# --push NEVER touches the public repo's main branch directly: it force-
# pushes an orphan branch `sync-<date>` (no shared history, so nothing that
# was ever excluded can resurface via a merge) and prints a compare URL —
# opening/merging the PR is a separate, conscious human step.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PUBLIC_REPO="${PUBLIC_REPO:-Lambenthan/fishes}"
PUSH=0
[ "${1:-}" = "--push" ] && PUSH=1

# ---- 1. The allowlist — every path that is allowed into the public shell.
# Baseline matches the last verified-good publish (audited by cloning the
# live public repo); `examples/` was added deliberately on top of that
# baseline — real run outputs (nlsw88 figures/regression, a literature-review
# PDF/Word), audited to contain zero proprietary skill content, kept for a
# better public-shell trial experience. Adding something here is a content
# decision — do it deliberately,
# not as a side effect of an unrelated change.
ALLOW=(
  AGENTS.md
  CLAUDE.md
  LICENSE
  README.md
  README.zh.md
  UPSTREAM_FREEZE.txt
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  apps/desktop
  packages
  examples
  scripts/README.md
  scripts/dev
  scripts/release/release.sh
  scripts/release/publish-shell.sh
  website
  docs/CONNECT_YOUR_TOOLS.md
  docs/INSTALL.zh.md
  runtime/rules
  runtime/manager
  runtime/mcp
  runtime/opencode-profile
  runtime/kernel
  runtime/skills/README.md
  runtime/skills/core/README.md
  runtime/skills/core/export-qdpx
  runtime/skills/core/large-file
  runtime/agents/README.md
  runtime/plugins/README.md
)

# ---- 2. The denylist — proprietary SKILL names that must never appear
# anywhere in the snapshot, even in prose (the allowlist already excludes
# their directories; this catches a skill being *named* in a file that IS
# meant to be public, e.g. a rules doc saying "follow the stata-analyze
# skill" — a real case this script caught on its first run).
#
# Agent names (research-navigator, qual-coder, quant-runner, methods-referee)
# and two skill names that double as STEP_ACTIONS step ids (research-design,
# methodology-review) are deliberately NOT in this list: the shell's own UI
# code legitimately uses them as plain string identifiers (a step's `id` or
# the guided/autonomous toggle's agent id need to exist even when the actual
# .md skill/agent content is excluded by the allowlist — the step's visible
# title/description/prompt never names the skill, so nothing is leaked).
# Those files' ABSENCE is verified structurally below instead of by
# name-grepping, which would just false-positive on ordinary app code.
# "open-code" is also excluded from this list for a different reason: it's
# an ordinary English phrase for the qualitative-coding method (the README
# legitimately says "it open-codes a transcript…") and collides constantly;
# the actual `runtime/skills/core/open-code/` directory is already excluded
# structurally by the allowlist, so the name-grep isn't the real protection
# for it anyway.
DENY_NAMES=(
  bibliometric-analysis causal-identification citation-reviewer domain-check
  figure-provenance journal-docx latex-manuscript literature-review
  mechanism-heterogeneity paper-to-report
  publication-figures reproducible-research research-autopilot
  research-gap-verifier stata-analyze
  stats-integrity traceability-review
)

SNAP="$(mktemp -d)"
trap 'rm -rf "$SNAP"' EXIT
echo "▸ Building shell snapshot in $SNAP"

# Copy via `git ls-files`, NOT `cp -R` from the working tree: this is what
# keeps build junk out automatically (target/, node_modules/, dist/ are all
# gitignored, so they are never listed) without hand-maintaining a second
# exclude list that could drift from .gitignore. --others --exclude-standard
# also picks up files that are new-but-not-yet-committed (e.g. this ALLOW
# list itself, right after editing it) as long as they aren't gitignored.
for path in "${ALLOW[@]}"; do
  files="$(git ls-files --cached --others --exclude-standard -- "$path")"
  if [ -z "$files" ]; then
    echo "  (skip, no tracked/stageable files under: $path)"
    continue
  fi
  while IFS= read -r f; do
    # Skip files git still has staged/tracked but that are no longer on disk
    # (e.g. a deletion made but not yet committed) — publishing should reflect
    # the working tree, not stale index state.
    [ -f "$f" ] || continue
    mkdir -p "$SNAP/$(dirname "$f")"
    cp "$f" "$SNAP/$f"
  done <<< "$files"
done

# Placeholder READMEs must actually exist for the runtime/skills/core,
# runtime/agents, runtime/plugins dirs even when nothing else in them is
# allowed — otherwise the folder is silently just missing from the snapshot.
for d in runtime/skills/core runtime/agents runtime/plugins; do
  [ -f "$SNAP/$d/README.md" ] || {
    echo "✗ $d/README.md is missing from the snapshot — the public repo would"
    echo "  lose this folder's placeholder entirely. Add one before publishing."
    exit 1
  }
done

# runtime/agents and runtime/plugins must contain ONLY their placeholder
# README — this is the structural check that replaces name-grepping for
# agent/plugin content (see the DENY_NAMES comment above).
for d in runtime/agents runtime/plugins; do
  extra="$(find "$SNAP/$d" -type f ! -name README.md)"
  if [ -n "$extra" ]; then
    echo "✗ $d contains more than the placeholder README — proprietary content leaked in:"
    echo "$extra" | sed 's/^/    /'
    exit 1
  fi
done

# ---- 2.5. Post-copy excludes: paths technically under an allowed directory
# that must still never leave this repo. The bundled example TRANSCRIPTS are
# real conversation histories that embed actual tool-call traces from the
# proprietary methodology layer — not just a skill's name, but in places its
# loaded prose (caught live: session-figure.json contains the opening lines
# of the publication-figures skill; session-review.json even shows a
# `~/.claude/skills/...` path from the authoring machine). A name-grep alone
# would not have caught this — it is nested inside JSON tool-output content.
EXCLUDE=(
  apps/desktop/src/assets/examples
  # Tests for proprietary skills' Python helpers — the skill dirs themselves
  # are already excluded by the allowlist, so these would just import a path
  # that doesn't exist in the public tree (ImportError) AND describe the
  # excluded skill's purpose in their own docstrings. scripts/dev/ keeps only
  # test_large_file_probe.py (tests the one Python helper that IS public).
  scripts/dev/test_domain_check.py
  scripts/dev/test_stats_integrity.py
  scripts/dev/test_pdf_extract.py
)
for path in "${EXCLUDE[@]}"; do
  rm -rf "${SNAP:?}/$path"
done

# ---- 3. Verify: no proprietary name anywhere in the snapshot's text files.
# (Exclude the script's own source — it necessarily names everything it excludes.)
echo "▸ Scanning snapshot for proprietary names…"
HIT=0
for name in "${DENY_NAMES[@]}"; do
  if grep -rIl --exclude-dir=node_modules --exclude=publish-shell.sh -- "$name" "$SNAP" >/dev/null 2>&1; then
    echo "  ✗ found reference to proprietary name: $name"
    grep -rIln --exclude-dir=node_modules --exclude=publish-shell.sh -- "$name" "$SNAP" | sed 's/^/      /'
    HIT=1
  fi
done
[ "$HIT" = 0 ] || { echo "✗ Aborting — proprietary references found. Fix and re-run."; exit 1; }
echo "  clean."

# ---- 4. Verify: every resource this app's tauri.conf.json expects to build
# actually exists in the snapshot (or is populated by a fetch script), so
# the public repo can build without a resource the sync silently dropped.
echo "▸ Checking apps/desktop/src-tauri/tauri.conf.json resource paths…"
python3 - "$SNAP" <<'PY'
import json, os, sys
snap = sys.argv[1]
conf = json.load(open(f"{snap}/apps/desktop/src-tauri/tauri.conf.json"))
resources = conf.get("bundle", {}).get("resources", conf.get("resources", {}))
fetch_scripts = os.listdir(f"{snap}/scripts/dev") if os.path.isdir(f"{snap}/scripts/dev") else []
missing = []
for src in resources:
    # src is like "../../../examples" relative to apps/desktop/src-tauri
    abspath = os.path.normpath(f"{snap}/apps/desktop/src-tauri/{src}")
    if os.path.exists(abspath):
        continue
    # Fetched at build/CI time (fetch-opencode.sh / fetch-uv.sh / fetch-skills.sh)?
    name = os.path.basename(src)
    fetched = any(name in open(f"{snap}/scripts/dev/{f}").read() for f in fetch_scripts)
    if not fetched:
        missing.append(src)
if missing:
    print("  ✗ resource path(s) not present in the snapshot and not fetched by any scripts/dev/*.sh:")
    for m in missing:
        print(f"      {m}")
    print("  Either add the path to ALLOW in publish-shell.sh, or add a fetch step,")
    print("  or remove it from tauri.conf.json's resources before publishing.")
    sys.exit(1)
print("  clean.")
PY

# ---- 4.5. Verify: every `@/...` static import in the frontend resolves to a
# real file in the snapshot. Step 2.5 above deliberately excludes files that
# ARE imported (the example transcripts) — this is what catches that and
# fails loudly instead of shipping a public shell whose build breaks.
echo "▸ Checking frontend static imports resolve inside the snapshot…"
python3 - "$SNAP" <<'PY'
import os, re, sys
snap = sys.argv[1]
src_root = f"{snap}/apps/desktop/src"
missing = []
for root, dirs, files in os.walk(src_root):
    dirs[:] = [d for d in dirs if d != "node_modules"]
    for fn in files:
        if not fn.endswith((".ts", ".tsx")):
            continue
        path = os.path.join(root, fn)
        text = open(path, encoding="utf-8", errors="ignore").read()
        for spec in re.findall(r'from\s+["\'](@/[^"\']+)["\']', text):
            rel = spec.replace("@/", "apps/desktop/src/", 1)
            candidates = [rel] + [rel + ext for ext in (".ts", ".tsx", ".json", ".png", ".jpg", ".svg")]
            if not any(os.path.exists(f"{snap}/{c}") for c in candidates):
                missing.append((os.path.relpath(path, snap), spec))
if missing:
    print("  ✗ static import(s) with no matching file in the snapshot — the public build would fail:")
    for f, spec in missing:
        print(f"      {f} imports \"{spec}\"")
    print("  This means step 2.5 excluded something that ordinary app code still")
    print("  imports. Either stop excluding it (if it's actually safe to publish),")
    print("  or change the importing code so the public build doesn't need it —")
    print("  do not just delete the check.")
    sys.exit(1)
print("  clean.")
PY

# ---- 5. Diff-stat against the live public repo, so the human reviews the
# actual change before anything is pushed.
CMP="$(mktemp -d)"
trap 'rm -rf "$SNAP" "$CMP"' EXIT
echo "▸ Cloning current public repo for comparison…"
git clone --depth 1 -q "https://github.com/$PUBLIC_REPO.git" "$CMP/live" 2>/dev/null || {
  echo "  (public repo not reachable — skipping diff-stat, this is fine for a first publish)"
}
if [ -d "$CMP/live" ]; then
  rm -rf "$CMP/live/.git"
  echo "▸ Diff vs. live public repo:"
  diff -rq "$CMP/live" "$SNAP" --exclude=.git 2>/dev/null | sed 's/^/  /' || true
fi

if [ "$PUSH" = 0 ]; then
  echo ""
  echo "✓ Dry run complete. Snapshot verified clean at: $SNAP"
  echo "  Re-run with --push to publish it to a review branch on $PUBLIC_REPO."
  trap - EXIT
  read -r -p "Snapshot left at $SNAP for inspection — press Enter to delete it, or Ctrl-C to keep it: " _
  rm -rf "$SNAP" "$CMP"
  exit 0
fi

# ---- 6. Push — always to a fresh orphan branch, never straight to main.
BRANCH="sync-$(date -u +%Y%m%d-%H%M)"
echo "▸ Pushing orphan branch $BRANCH to $PUBLIC_REPO…"
git -C "$SNAP" init -q -b "$BRANCH"
git -C "$SNAP" add -A
git -C "$SNAP" -c user.name="fishes-publish" -c user.email="noreply@example.invalid" \
  commit -q -m "Sync shell from private repo ($(date -u +%Y-%m-%d))"
git -C "$SNAP" remote add origin "https://github.com/$PUBLIC_REPO.git"
git -C "$SNAP" push -f origin "$BRANCH"

echo ""
echo "✓ Pushed. Review the diff and merge deliberately:"
echo "    https://github.com/$PUBLIC_REPO/compare/main...$BRANCH"
