#!/usr/bin/env bash
set -euo pipefail

# Bump every colorful-tmpl workspace package version in lockstep,
# sync @colorful-tmpl/* dep pins, refresh package-lock.json.
# No git — commit yourself, then tag with scripts/tag-version.sh.
#
# Usage:
#   bash scripts/bump-version.sh patch
#   bash scripts/bump-version.sh minor
#   bash scripts/bump-version.sh major
#   bash scripts/bump-version.sh set 1.2.3
#   bash scripts/bump-version.sh <cmd> --dry-run

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CANONICAL_PKG="packages/core/package.json"

log_error() { printf "\033[0;31m[ERROR]\033[0m %s\n" "$1" >&2; }
log_info()  { printf "\033[1;33m[INFO]\033[0m  %s\n" "$1"; }
log_ok()    { printf "\033[0;32m[OK]\033[0m    %s\n" "$1"; }

dry_run=false
args=()
for a in "$@"; do
  [[ "$a" == "--dry-run" ]] && dry_run=true || args+=("$a")
done
set -- "${args[@]:-}"

command="${1:-}"
[[ -z "$command" ]] && { log_error "Missing command."; sed -n '3,9p' "$0" >&2; exit 2; }

current=$(node -e "process.stdout.write(require('./$CANONICAL_PKG').version)")
echo "Current: $current"

major=$(echo "$current" | cut -d. -f1)
minor=$(echo "$current" | cut -d. -f2)
patch=$(echo "$current" | cut -d. -f3 | sed 's/-.*//')

case "$command" in
  major) new="$((major + 1)).0.0" ;;
  minor) new="$major.$((minor + 1)).0" ;;
  patch) new="$major.$minor.$((patch + 1))" ;;
  set)   new="${2:-}"; [[ -z "$new" ]] && { log_error "set needs version."; exit 2; } ;;
  *)     log_error "Unknown: $command"; exit 2 ;;
esac

echo "New:     $new"

if [[ "$dry_run" == true ]]; then
  echo "[DRY RUN] Would set versions to $new, sync deps, refresh lockfile."
  exit 0
fi

log_info "Syncing dep pins to $current..."
bash scripts/sync-workspace-deps.sh

if [[ "$new" != "$current" ]]; then
  log_info "Setting workspace versions to $new..."
  node scripts/set-workspace-versions.mjs "$new"
  log_info "Re-syncing dep pins to $new..."
  bash scripts/sync-workspace-deps.sh
fi

log_info "Refreshing package-lock.json..."
npm install --package-lock-only --no-audit --no-fund >/dev/null

log_ok "Bumped to $new. Commit, then: bash scripts/tag-version.sh"
