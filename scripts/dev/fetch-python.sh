#!/usr/bin/env bash
# Fetch a standalone CPython (python-build-standalone, PSF-licensed) and place
# its extracted tree at apps/desktop/src-tauri/python-runtime/python/ so it can
# be bundled as a Tauri resource. When present, uv is pointed at this
# interpreter (runtime::bundled_python) and provisions the analysis env with
# ZERO network download — a fully offline first run. Absent, uv falls back to
# downloading a managed 3.12 (the app still works, just needs the network once).
set -euo pipefail

# python-build-standalone release tag + CPython version (install_only variant).
PBS_TAG="${PBS_TAG:-20250115}"
CPYTHON="${CPYTHON:-3.12.8}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/apps/desktop/src-tauri/python-runtime"

TRIPLE="${1:-$(rustc -Vv | sed -n 's/host: //p')}"

# python-build-standalone triples match Rust's for our targets.
case "$TRIPLE" in
  aarch64-apple-darwin | x86_64-apple-darwin | \
  x86_64-pc-windows-msvc | x86_64-unknown-linux-gnu | aarch64-unknown-linux-gnu) : ;;
  *) echo "Unsupported triple: $TRIPLE" >&2; exit 1 ;;
esac

ASSET="cpython-${CPYTHON}+${PBS_TAG}-${TRIPLE}-install_only.tar.gz"
URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${ASSET}"

TMP="$(mktemp -d)"
echo "Downloading $URL"
curl -fsSL "$URL" -o "$TMP/py.tar.gz"

# The install_only archive extracts to a top-level `python/` directory
# (bin/python3 on unix, python.exe on windows). Place it verbatim.
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
tar -xzf "$TMP/py.tar.gz" -C "$OUT_DIR"
rm -rf "$TMP"

# Sanity: the interpreter must be where runtime::bundled_python looks.
if [ -x "$OUT_DIR/python/bin/python3" ] || [ -f "$OUT_DIR/python/python.exe" ]; then
  echo "Bundled CPython ${CPYTHON} for ${TRIPLE} at $OUT_DIR/python"
else
  echo "ERROR: extracted tree has no interpreter at the expected path" >&2
  ls -R "$OUT_DIR" | head -40 >&2
  exit 1
fi
