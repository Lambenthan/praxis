#!/usr/bin/env bash
# Build a SIGNED Praxis release and generate the updater manifest (latest.json).
#
# What it does:
#   1. Signs the build with your private key (~/.tauri/praxis-updater.key)
#   2. Produces the .dmg (first-time install) AND the signed .app.tar.gz (update)
#   3. Writes latest.json — the manifest the running app polls to learn there's
#      a new version. The signature is embedded, so you upload only three files.
#
# One-time setup before the FIRST real release:
#   - In apps/desktop/src-tauri/tauri.conf.json, replace OWNER/REPO in
#     plugins.updater.endpoints with your GitHub repo.
#   - Keep ~/.tauri/praxis-updater.key secret and backed up. Lose it and you can
#     never ship a trusted update again.
#
# Each release:
#   1. Bump "version" in apps/desktop/src-tauri/tauri.conf.json.
#   2. OWNER=you REPO=praxis NOTES="what changed" scripts/release/release.sh
#   3. Create a GitHub Release tagged v<version> and upload the three files it
#      prints. The app picks it up on the next launch.
set -euo pipefail

KEY="${HOME}/.tauri/praxis-updater.key"
: "${OWNER:?set OWNER=<your github user/org>}"
: "${REPO:?set REPO=<your github repo>}"
NOTES="${NOTES:-Bug fixes and improvements.}"
[ -f "$KEY" ] || { echo "signing key not found at $KEY"; exit 1; }

DESKTOP="$(cd "$(dirname "$0")/../../apps/desktop" && pwd)"
cd "$DESKTOP"

export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

VERSION="$(python3 -c "import json;print(json.load(open('src-tauri/tauri.conf.json'))['version'])")"
echo "▸ Building Praxis $VERSION (signed)…"
pnpm exec tauri build

BUNDLE="src-tauri/target/release/bundle"
TARGZ="$BUNDLE/macos/Praxis.app.tar.gz"
SIG="$TARGZ.sig"
DMG="$BUNDLE/dmg/Praxis_${VERSION}_aarch64.dmg"
[ -f "$SIG" ] || { echo "no .sig produced — is createUpdaterArtifacts true in tauri.conf?"; exit 1; }

# Versioned asset name for the GitHub Release (the URL in latest.json).
ASSET="Praxis_${VERSION}_aarch64.app.tar.gz"
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
        # Apple Silicon. Add "darwin-x86_64" / "windows-x86_64" here when those
        # targets are built and signed.
        "darwin-aarch64": {
            "signature": open(sigpath).read().strip(),
            "url": f"https://github.com/{owner}/{repo}/releases/download/v{version}/{asset}",
        }
    },
}
print(json.dumps(doc, indent=2))
PY

echo ""
echo "✓ Done. Create a GitHub Release tagged v$VERSION on $OWNER/$REPO and upload:"
echo "    $DESKTOP/$BUNDLE/macos/$ASSET      ← the update package"
echo "    $DESKTOP/$BUNDLE/latest.json        ← the update manifest"
echo "    $DESKTOP/$DMG   ← first-time install"
echo ""
echo "The running app checks $OWNER/$REPO's latest release on launch and will"
echo "offer this version in the in-app update dialog."
