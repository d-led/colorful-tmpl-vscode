#!/usr/bin/env bash
set -euo pipefail

# One local run of every suite: unit + approval tests (vitest), then the VS Code
# extension integration tests (Extension Development Host). Mirrors what the
# GitHub Actions workflows run — see .github/workflows/ci.yml and
# .github/workflows/ci-vscode-extension.yml.
#
# Usage: bash scripts/test-all.sh   (or: npm run test:all)
#
# Environment:
#   COLORFUL_TMPL_SKIP_VSCODE=1   skip the VS Code tests (no GUI / no Electron)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> unit + approval tests (vitest)" >&2
npm test

if [[ "${COLORFUL_TMPL_SKIP_VSCODE:-}" == "1" ]]; then
  echo "==> skip VS Code extension tests (COLORFUL_TMPL_SKIP_VSCODE=1)" >&2
else
  echo "==> VS Code extension tests" >&2
  bash scripts/test-vscode-extension.sh
fi

echo "==> test:all complete" >&2
