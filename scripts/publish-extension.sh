#!/usr/bin/env bash
set -euo pipefail

# Build, test, package, and publish the Colorful tmpl VS Code extension
# to the Visual Studio Marketplace.
#
# Usage:
#   bash scripts/publish-extension.sh                  # build + test + publish
#   bash scripts/publish-extension.sh --dry-run        # build + test, skip publish
#   bash scripts/publish-extension.sh --package-only   # just produce the .vsix
#
# Prerequisites:
#   - A Personal Access Token with Marketplace publish scope
#     (set via `vsce login` or the VSCE_PAT environment variable).

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mode="publish"
case "${1:-}" in
  --dry-run)      mode="package" ;;
  --package-only) mode="package" ;;
  "" )            mode="publish" ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac

echo "=== Colorful tmpl VS Code Extension Publisher ===" >&2

echo "1/3 Testing..." >&2
npx vitest run -c vitest.config.ts

echo "2/3 Building core + extension..." >&2
npm run build -w @colorful-tmpl/highlight-core
npm run build -w colorful-tmpl

echo "3/3 Packaging..." >&2
EXT_DIR="$REPO_ROOT/packages/vscode"
version=$(node -e "process.stdout.write(require('$EXT_DIR/package.json').version)")
vsix_path="$EXT_DIR/colorful-tmpl-${version}.vsix"
(cd "$EXT_DIR" && npx --yes @vscode/vsce@^3 package --no-dependencies --out "colorful-tmpl-${version}.vsix")
echo "   $vsix_path" >&2

if [[ "$mode" == "package" ]]; then
  echo "Done (package only). VSIX at $vsix_path" >&2
  exit 0
fi

echo "Publishing to Visual Studio Marketplace..." >&2
npx --yes @vscode/vsce@^3 publish -i "$vsix_path"

echo "Done. Colorful tmpl v$version published to Marketplace." >&2
