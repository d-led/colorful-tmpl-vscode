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

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

npm run build -w @colorful-tmpl/highlight-core
cd packages/vscode
npm run build

exec npm run test:vscode
