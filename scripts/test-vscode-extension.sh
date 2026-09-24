#!/usr/bin/env bash
set -euo pipefail

# Run the Colorful tmpl VS Code extension integration tests (Extension
# Development Host via @vscode/test-cli).
#
# Usage: bash scripts/test-vscode-extension.sh
#
# Optional: VSCODE_TEST_VERSION selects the VS Code build under test (stable,
# insiders, or an exact release like 1.95.0). VSCODE_TEST_PATH points at an
# already-installed VS Code (skips the download).
#
# Linux CI has no display. When CI=true and xvfb-run is available, the host runs
# under a virtual X server (see .github/workflows/ci-vscode-extension.yml).

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

npm run build -w @colorful-tmpl/highlight-core
cd packages/vscode
npm run build

if [[ "${CI:-}" == "true" ]] && [[ "$(uname -s)" == "Linux" ]] && command -v xvfb-run >/dev/null 2>&1; then
  exec xvfb-run -a npm run test:vscode
fi

exec npm run test:vscode
