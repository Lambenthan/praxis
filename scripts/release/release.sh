#!/usr/bin/env bash
# Local macOS-only build+sign helper — NOT the real multi-platform release path.
#
# THE REAL RELEASE PATH is .github/workflows/build.yml: bump the version, push
# a `v<version>` tag, and CI builds all 4 targets (macOS aarch64/x86_64,
# Windows x86_64, Linux) on their native runners, signs each with the
# TAURI_SIGNING_PRIVATE_KEY secret, and attaches everything to ONE draft
# GitHub Release. Because every matrix job targets that same release,
# tauri-action's updater-artifact step (createUpdaterArtifacts: true in
# tauri.conf.json) automatically merges each platform's signature into a
# SINGLE combined latest.json on the release — you do not assemble it by
# hand. Review the draft, then publish it; the running app picks up the new
# version on its next launch-time check.
#
# This script exists only to sanity-check the signing/updater pipeline
# locally on your own Mac (Apple Silicon only) BEFORE pushing a tag — e.g. to
# confirm the key still works and the update flow triggers in a dev build.
# Do NOT upload this script's output as if it were a full release: it only
# covers darwin-aarch64, so an update manifest built from it alone would leave
# Windows/Linux/Intel-Mac users unable to auto-update.
#
# One-time setup:
#   - In apps/desktop/src-tauri/tauri.conf.json, replace OWNER/REPO in
#     plugins.updater.endpoints with your GitHub repo.
#   - Keep ~/.tauri/fishes-updater.key secret and backed up. Lose it and you can
#     never ship a trusted update again.
#
# Usage: OWNER=you REPO=fishes NOTES="what changed" scripts/release/release.sh
set -euo pipefail

KEY="${HOME}/.tauri/fishes-updater.key"
: "${OWNER:?set OWNER=<your github user/org>}"
: "${REPO:?set REPO=<your github repo>}"
NOTES="${NOTES:-Bug fixes and improvements.}"
[ -f "$KEY" ] || { echo "signing key not found at $KEY"; exit 1; }

DESKTOP="$(cd "$(dirname "$0")/../../apps/desktop" && pwd)"
cd "$DESKTOP"

export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

VERSION="$(python3 -c "import json;print(json.load(open('src-tauri/tauri.conf.json'))['version'])")"
echo "▸ Building Fishes $VERSION (signed)…"
pnpm exec tauri build

BUNDLE="src-tauri/target/release/bundle"
TARGZ="$BUNDLE/macos/Fishes.app.tar.gz"
SIG="$TARGZ.sig"
DMG="$BUNDLE/dmg/Fishes_${VERSION}_aarch64.dmg"
[ -f "$SIG" ] || { echo "no .sig produced — is createUpdaterArtifacts true in tauri.conf?"; exit 1; }

# Versioned asset name for the GitHub Release (the URL in latest.json).
ASSET="Fishes_${VERSION}_aarch64.app.tar.gz"
cp "$TARGZ" "$BUNDLE/macos/$ASSET"

PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
python3 - "$VERSION" "$OWNER" "$REPO" "$NOTES" "$SIG" "$ASSET" "$PUB_DATE" > "$BUNDLE/latest.json" <<'PY'
import json, sys
version, owner, repo, notes, sigpath, asset, pub = sys.argv[1:8]
doc = {
    "version": version,
    "notes": notes,
    "pub_date": pub,
    "platforms": {
        # Apple Silicon only — this is a LOCAL sanity build, not the real
        # multi-platform release (see the file header). CI's tauri-action
        # merges all 4 platforms into one latest.json automatically.
        "darwin-aarch64": {
            "signature": open(sigpath).read().strip(),
            "url": f"https://github.com/{owner}/{repo}/releases/download/v{version}/{asset}",
        }
    },
}
print(json.dumps(doc, indent=2))
PY

echo ""
echo "✓ Local sanity build done (darwin-aarch64 only):"
echo "    $DESKTOP/$BUNDLE/macos/$ASSET"
echo "    $DESKTOP/$BUNDLE/latest.json"
echo "    $DESKTOP/$DMG"
echo ""
echo "This is NOT the release. For a real multi-platform release: bump the"
echo "version, push a v\$VERSION tag, let CI build+sign all 4 targets and"
echo "auto-merge latest.json into one draft Release, then review and publish it."
