#!/usr/bin/env bash
set -euo pipefail

# Create an annotated git tag v<version> matching packages/core/package.json.
# Does not bump versions — run after committing a version bump.
#
# Preconditions:
#   - inside a git repository
#   - clean working tree (everything committed, including the bump)
#   - tag v<version> does not already exist
#
# Usage:
#   bash scripts/tag-version.sh           # create v0.0.2 from package.json
#   bash scripts/tag-version.sh --dry-run # show what would happen

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CANONICAL_PKG="packages/core/package.json"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'
log_ok()    { printf "%s[OK]%s %s\n"    "$GREEN"  "$NC" "$1"; }
log_error() { printf "%s[ERROR]%s %s\n" "$RED"    "$NC" "$1" >&2; }
log_info()  { printf "%s[INFO]%s %s\n"  "$YELLOW" "$NC" "$1"; }

dry_run=false
for a in "$@"; do
  case "$a" in
    --dry-run) dry_run=true ;;
    *) log_error "Unknown argument: $a"; exit 2 ;;
  esac
done

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  log_error "Not inside a git repository."
  exit 1
fi

version=$(node -e "process.stdout.write(require('./$CANONICAL_PKG').version)")
tag="v$version"

if git rev-parse --verify --quiet "$tag" >/dev/null; then
  log_error "Tag $tag already exists."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  log_error "Working tree is not clean. Commit or stash before tagging."
  exit 1
fi

if [[ "$dry_run" == true ]]; then
  log_info "Would create annotated tag $tag at HEAD (version from $CANONICAL_PKG)."
  exit 0
fi

git tag -a "$tag" -m "Version $version"
log_ok "Created tag $tag"
echo "Push with: git push && git push --tags"
