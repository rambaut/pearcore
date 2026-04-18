#!/bin/bash
# Stage web assets into dist-tauri/ for the Tauri build.
# Called automatically via tauri.conf.json → build.beforeBuildCommand.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/dist-tauri"

rm -rf "$DEST"
mkdir -p "$DEST"

# Mirror the two source trees (pearcore + peartree) keeping directory structure.
# rsync is available on macOS by default.
rsync -a --exclude='*.md' "$ROOT/pearcore/" "$DEST/pearcore/"
rsync -a --exclude='*.md' "$ROOT/peartree/" "$DEST/peartree/"

echo "Staged Tauri frontend → $DEST"
