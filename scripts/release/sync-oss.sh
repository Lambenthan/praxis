#!/usr/bin/env bash
# Mirror a published GitHub Release's updater assets to Alibaba Cloud OSS, so
# mainland-China users hit a fast domestic endpoint instead of GitHub's CDN.
#
# This does NOT replace the GitHub release — it runs AFTER you've published
# the draft release in the GitHub UI (installers + latest.json already
# uploaded there, tauri-action already merged all platforms into one
# latest.json). This script downloads that release's assets and re-uploads
# them to OSS under the same version prefix, plus refreshes a stable
# "latest.json" at the bucket root that always points at the newest version.
#
# One-time setup:
#   brew install ossutil
#   ossutil config   # paste your RAM sub-account AccessKey ID/Secret + endpoint
#
# Usage:
#   OWNER=Lambenthan REPO=fishes TAG=v0.1.4 BUCKET=fishes-updates \
#     scripts/release/sync-oss.sh
#
# Optional:
#   SKIP_MANIFEST=1   Upload the versioned assets but do NOT refresh the
#                     stable latest.json — no installed app sees the update
#                     yet. Hand testers a direct installer link first; re-run
#                     without the flag to broadcast once they confirm.
#   NOTES_FILE=path   Replace latest.json's `notes` (the text the in-app
#                     update dialog shows) with this file's content — belt
#                     and braces in case the CI-built manifest carries stale
#                     or default notes.
set -euo pipefail

: "${OWNER:?set OWNER=<github owner>}"
: "${REPO:?set REPO=<github repo>}"
: "${TAG:?set TAG=<release tag, e.g. v0.1.4>}"
: "${BUCKET:?set BUCKET=<oss bucket name>}"
ENDPOINT="${ENDPOINT:-oss-cn-hangzhou.aliyuncs.com}"

command -v gh >/dev/null || { echo "gh (GitHub CLI) is required: brew install gh"; exit 1; }
command -v ossutil >/dev/null || { echo "ossutil is required: brew install ossutil"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "▸ Downloading release assets for ${OWNER}/${REPO}@${TAG}…"
gh release download "$TAG" --repo "${OWNER}/${REPO}" --dir "$WORK" --clobber

echo "▸ Release contents:"
ls -la "$WORK"

VERSION="${TAG#v}"

echo "▸ Uploading versioned assets to oss://${BUCKET}/releases/${VERSION}/ …"
ossutil cp "$WORK/" "oss://${BUCKET}/releases/${VERSION}/" \
  --recursive --update --endpoint "https://${ENDPOINT}"

# The updater endpoint always reads a stable path — refresh it to point at
# this version's latest.json (whose asset URLs we rewrite below to OSS).
if [ "${SKIP_MANIFEST:-}" = "1" ]; then
  echo "▸ SKIP_MANIFEST=1 — versioned assets uploaded, stable latest.json untouched."
  echo "  Direct installer links live under: https://${BUCKET}.${ENDPOINT}/releases/${VERSION}/"
elif [ -f "$WORK/latest.json" ]; then
  echo "▸ Rewriting asset URLs in latest.json to point at OSS…"
  python3 - "$WORK/latest.json" "$BUCKET" "$VERSION" "$ENDPOINT" "${NOTES_FILE:-}" > "$WORK/latest.oss.json" <<'PY'
import json, sys
path, bucket, version, endpoint, notes_file = sys.argv[1:6]
doc = json.load(open(path))
for plat in doc.get("platforms", {}).values():
    url = plat.get("url", "")
    filename = url.rsplit("/", 1)[-1]
    plat["url"] = f"https://{bucket}.{endpoint}/releases/{version}/{filename}"
if notes_file:
    doc["notes"] = open(notes_file).read().strip()
json.dump(doc, open(path, "w"), indent=2, ensure_ascii=False)
print(json.dumps(doc, indent=2, ensure_ascii=False))
PY

  echo "▸ Publishing stable oss://${BUCKET}/latest.json …"
  ossutil cp "$WORK/latest.json" "oss://${BUCKET}/latest.json" \
    --endpoint "https://${ENDPOINT}" --force
else
  echo "::warning:: no latest.json found in the release — updater endpoint not refreshed"
fi

echo ""
echo "✓ Synced ${TAG} to oss://${BUCKET}/"
echo "  Versioned assets: https://${BUCKET}.${ENDPOINT}/releases/${VERSION}/"
echo "  Stable manifest:  https://${BUCKET}.${ENDPOINT}/latest.json"
