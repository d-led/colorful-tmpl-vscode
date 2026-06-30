#!/usr/bin/env bash
set -euo pipefail

# Build, package, and install the Go Template Rainbow VS Code extension
# into the currently running editor (the one whose integrated terminal we're in).
#
# Usage:
#   bash scripts/install-here.sh                  # build + install
#   bash scripts/install-here.sh --package-only   # just produce the .vsix
#   bash scripts/install-here.sh --uninstall      # remove the extension

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

EXT_DIR="$REPO_ROOT/packages/vscode"
EXT_ID="d-led.colorful-tmpl"

# ---- mode ---------------------------------------------------------------

mode="install"
case "${1:-}" in
  --package-only) mode="package" ;;
  --uninstall)    mode="uninstall" ;;
  "" | --install) mode="install" ;;
  *) echo "Usage: $0 [--install|--package-only|--uninstall]" >&2; exit 2 ;;
esac

# ---- uninstall ----------------------------------------------------------

if [[ "$mode" == "uninstall" ]]; then
  echo "==> Uninstalling $EXT_ID …"
  if command -v code >/dev/null 2>&1; then
    code --uninstall-extension "$EXT_ID" 2>/dev/null || true
  fi
  echo "    Done."
  exit 0
fi

# ---- build --------------------------------------------------------------

echo "==> Building @colorful-tmpl/highlight-core …"
npm run build -w @colorful-tmpl/highlight-core

echo "==> Building colorful-tmpl …"
npm run build -w colorful-tmpl

# ---- package ------------------------------------------------------------

echo "==> Packaging $EXT_ID …"
cd "$EXT_DIR"
npx vsce package --no-dependencies

VSIX_FILE=$(ls -t "$EXT_DIR"/*.vsix 2>/dev/null | head -1)
if [[ -z "${VSIX_FILE:-}" ]]; then
  echo "ERROR: No .vsix produced." >&2
  exit 1
fi
echo "    .vsix: $VSIX_FILE"

if [[ "$mode" == "package" ]]; then
  exit 0
fi

# ---- install ------------------------------------------------------------

echo "==> Installing into current editor …"

# Uninstall any previous version first (old ID and new ID)
code --uninstall-extension "d-led.gotmpl-vscode" 2>/dev/null || true
code --uninstall-extension "$EXT_ID" 2>/dev/null || true

code --install-extension "$VSIX_FILE" --force

echo ""
echo "    Installed. If you have a .tmpl / .gotmpl file open, change its"
echo "    language mode to 'Go Template' (Cmd+K M → gotmpl) to activate."
