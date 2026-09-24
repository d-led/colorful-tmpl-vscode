#!/usr/bin/env bash
set -euo pipefail

# Build, package and install the Colorful Go Template extension into the editor
# that owns this terminal, then check that the editor really got it.
#
# Usage:
#   bash scripts/install-here.sh                  # build + force-install + verify
#   bash scripts/install-here.sh --package-only   # just produce the .vsix
#   bash scripts/install-here.sh --check          # is the editor running this build?
#   bash scripts/install-here.sh --uninstall      # remove the extension
#   bash scripts/install-here.sh --insiders       # target the Insiders editor
#
# Environment:
#   CODE_CLI             editor CLI to use (default: code)
#   VSCODE_EXTENSIONS_DIR where that editor keeps extensions
#                        (default: ~/.vscode/extensions)
#
# Why not `code --install-extension *.vsix`:
#   VS Code silently refuses to install a VSIX that is not newer than the one
#   already installed unless --force is passed — it prints "A newer version …
#   is already installed. Use '--force' …" and installs nothing. A *.vsix glob
#   additionally hands it the older builds that pile up in packages/vscode, so
#   the command stops on an old file, the fresh build never lands, and the
#   editor keeps running the previous version while the command looks like it
#   ran. This script removes stale .vsix files, force-installs exactly the file
#   it just built, and verifies the installed bundle afterwards.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

EXT_DIR="$REPO_ROOT/packages/vscode"
EXT_ID="d-led.colorful-tmpl"
EXT_NAME="$(node -p "require('$EXT_DIR/package.json').name")"
EXT_VERSION="$(node -p "require('$EXT_DIR/package.json').version")"
BUILT_BUNDLE="$EXT_DIR/dist/extension.js"

CODE_CLI="${CODE_CLI:-code}"
EXTENSIONS_DIR="${VSCODE_EXTENSIONS_DIR:-$HOME/.vscode/extensions}"

# ---- mode ---------------------------------------------------------------

mode="install"
for arg in "$@"; do
  case "$arg" in
    --package-only) mode="package" ;;
    --check)        mode="check" ;;
    --uninstall)    mode="uninstall" ;;
    --install)      mode="install" ;;
    --insiders)
      CODE_CLI="${CODE_CLI:-code-insiders}"
      EXTENSIONS_DIR="${VSCODE_EXTENSIONS_DIR:-$HOME/.vscode-insiders/extensions}"
      ;;
    *) echo "Usage: $0 [--install|--package-only|--check|--uninstall|--insiders]" >&2; exit 2 ;;
  esac
done

require_cli() {
  if ! command -v "$CODE_CLI" >/dev/null 2>&1; then
    echo "ERROR: '$CODE_CLI' is not on PATH." >&2
    echo "       Run 'Shell Command: Install … command in PATH', or name your CLI:" >&2
    echo "       CODE_CLI=code-insiders $0" >&2
    exit 1
  fi
}

verify_install() {
  node "$REPO_ROOT/scripts/verify-installed-extension.mjs" \
    --extensions-dir "$EXTENSIONS_DIR" \
    --id "$EXT_ID" \
    --version "$EXT_VERSION" \
    --built "$BUILT_BUNDLE"
}

# ---- uninstall ----------------------------------------------------------

if [[ "$mode" == "uninstall" ]]; then
  require_cli
  echo "==> Uninstalling $EXT_ID …"
  "$CODE_CLI" --uninstall-extension "d-led.gotmpl-vscode" 2>/dev/null || true
  "$CODE_CLI" --uninstall-extension "$EXT_ID" 2>/dev/null || true
  echo "    Done. Reload the window to drop the extension host."
  exit 0
fi

# ---- check --------------------------------------------------------------

if [[ "$mode" == "check" ]]; then
  if [[ ! -f "$BUILT_BUNDLE" ]]; then
    echo "ERROR: $BUILT_BUNDLE not found — build first: bash scripts/install-here.sh" >&2
    exit 1
  fi
  echo "==> Checking whether $EXT_ID $EXT_VERSION is installed in $CODE_CLI …"
  verify_install
  exit 0
fi

# ---- build --------------------------------------------------------------

echo "==> Building @colorful-tmpl/highlight-core …"
npm run build -w @colorful-tmpl/highlight-core

echo "==> Building colorful-tmpl …"
npm run build -w colorful-tmpl

# ---- package ------------------------------------------------------------

# Stale .vsix files are never the build we want, and they are what made the
# CLI refuse to install ("downgrade"). Keep exactly one.
echo "==> Packaging $EXT_ID $EXT_VERSION …"
rm -f "$EXT_DIR"/*.vsix
(cd "$EXT_DIR" && npx vsce package --no-dependencies)

VSIX_FILE="$EXT_DIR/$EXT_NAME-$EXT_VERSION.vsix"
if [[ ! -f "$VSIX_FILE" ]]; then
  echo "ERROR: expected $VSIX_FILE. Found: $(ls "$EXT_DIR"/*.vsix 2>/dev/null || echo none)" >&2
  exit 1
fi
echo "    .vsix: $VSIX_FILE"

if [[ "$mode" == "package" ]]; then
  exit 0
fi

# ---- install ------------------------------------------------------------

require_cli
echo "==> Installing into $CODE_CLI …"
"$CODE_CLI" --install-extension "$VSIX_FILE" --force

echo "==> Verifying the installed build …"
verify_install

echo ""
echo "    Installed $EXT_ID $EXT_VERSION. VS Code keeps the previous extension"
echo "    host until you reload: ⇧⌘P → 'Developer: Reload Window'."
echo "    Check what is installed any time: bash scripts/install-here.sh --check"
