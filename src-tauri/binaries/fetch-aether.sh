#!/usr/bin/env bash
# Fetch the complete engine release pinned in ../aether-release.json into
# engine/ (aether + pt/lyrebird), SHA-256 verified from the GitHub release.
# AETHER_ASSET retains the macOS cross-build override (pinned assets only).
# Run before `tauri dev` / `tauri build`; CI invokes this for Linux/macOS.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/fetch-aether.py" "$@"
