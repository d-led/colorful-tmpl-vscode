#!/usr/bin/env bash
set -euo pipefail
# Thin wrapper — delegates to the .mjs script next to it.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$REPO_ROOT/scripts/sync-workspace-deps.mjs" "$@"
