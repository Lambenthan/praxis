#!/usr/bin/env bash
# Fetch ripgrep and place it as a Tauri sidecar
# (apps/desktop/src-tauri/binaries/rg-<target-triple>[.exe]).
#
# WHY THIS EXISTS: OpenCode's grep tool resolves ripgrep by `which("rg")` on
# PATH, then a cached copy, then — if neither is found — it DOWNLOADS ripgrep
# from github.com on first launch, BLOCKING the server from listening until the
# download completes. On a fresh machine behind a slow/blocked GitHub (mainland
# China especially) that download hangs, so the app is stuck "还在启动" forever.
# Bundling `rg` and putting the app's binary dir on the sidecar PATH (see
# runtime::agent_path) means OpenCode's `which("rg")` finds it instantly — the
# runtime starts offline, first try, everywhere.
set -euo pipefail

# Match the version OpenCode itself pins, so behavior is identical to its own
# managed copy (packages/core/src/ripgrep/binary.ts).
RG_VERSION="${RG_VERSION:-15.1.0}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/apps/desktop/src-tauri/binaries"
mkdir -p "$OUT_DIR"

# Resolve the Rust target triple (arg 1 overrides; else host).
TRIPLE="${1:-$(rustc -Vv | sed -n 's/host: //p')}"

# Map the Rust triple to ripgrep's release asset. ripgrep ships musl (not gnu)
# for linux — a static build that runs on any glibc — so gnu maps to musl.
case "$TRIPLE" in
  aarch64-apple-darwin)      RG_TRIPLE="aarch64-apple-darwin";        EXT="tar.gz" ;;
  x86_64-apple-darwin)       RG_TRIPLE="x86_64-apple-darwin";         EXT="tar.gz" ;;
  x86_64-pc-windows-msvc)    RG_TRIPLE="x86_64-pc-windows-msvc";      EXT="zip" ;;
  aarch64-pc-windows-msvc)   RG_TRIPLE="aarch64-pc-windows-msvc";     EXT="zip" ;;
  x86_64-unknown-linux-gnu)  RG_TRIPLE="x86_64-unknown-linux-musl";   EXT="tar.gz" ;;
  aarch64-unknown-linux-gnu) RG_TRIPLE="aarch64-unknown-linux-gnu";   EXT="tar.gz" ;;
  *) echo "Unsupported triple: $TRIPLE" >&2; exit 1 ;;
esac

ASSET="ripgrep-${RG_VERSION}-${RG_TRIPLE}.${EXT}"
URL="https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/${ASSET}"
TMP="$(mktemp -d)"
echo "Downloading $URL"
curl -fsSL "$URL" -o "$TMP/$ASSET"
case "$ASSET" in
  *.tar.gz) tar -xzf "$TMP/$ASSET" -C "$TMP" ;;
  *)
    if command -v unzip >/dev/null 2>&1; then
      unzip -oq "$TMP/$ASSET" -d "$TMP"
    else
      tar -xf "$TMP/$ASSET" -C "$TMP"   # bsdtar (macOS/Windows) extracts zip
    fi
    ;;
esac

# The archive extracts to ripgrep-<ver>-<triple>/rg (or rg.exe).
if [ -f "$TMP/rg.exe" ] || find "$TMP" -type f -name rg.exe | grep -q .; then
  BIN="$(find "$TMP" -type f -name rg.exe | head -1)"
  cp "$BIN" "$OUT_DIR/rg-$TRIPLE.exe"
else
  BIN="$(find "$TMP" -type f -name rg | head -1)"
  cp "$BIN" "$OUT_DIR/rg-$TRIPLE"
  chmod +x "$OUT_DIR/rg-$TRIPLE"
fi
rm -rf "$TMP"
echo "Placed ripgrep sidecar for $TRIPLE in $OUT_DIR"
