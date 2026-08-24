#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/.." &>/dev/null && pwd)
CONFIG_ABS="${SCRIPT_DIR}/eslint.mjs"
RULES_JSON="${SCRIPT_DIR}/eslint.rules.json"

# path.relative(start, target); start and target must exist (Node is already required for npx/eslint).
relpath_under() {
  local start="$1"
  local target="$2"
  node -e "console.log(require('path').relative(process.argv[1], process.argv[2]))" "${start}" "${target}"
}

# Starting from a file or directory, print the nearest ancestor directory containing package.json.
find_npm_package_root() {
  local path="$1"
  local dir
  if [[ -f "${path}" ]]; then
    dir=$(cd -- "$(dirname -- "${path}")" &>/dev/null && pwd)
  else
    dir=$(cd -- "${path}" &>/dev/null && pwd)
  fi
  while [[ -n "${dir}" && "${dir}" != "/" ]]; do
    if [[ -f "${dir}/package.json" ]]; then
      echo "${dir}"
      return 0
    fi
    dir=$(dirname "${dir}")
  done
  return 1
}

usage() {
  cat <<'EOF'
Refactoring / maintainability lint for JS/TS via ESLint
(see scripts/eslint.rules.json).

Usage:
  ./scripts/analyze.js-ts.sh [options] <path-in-package> [-- extra eslint paths...]

  The first path is either the npm package root (directory with package.json) or any path inside
  that package (subfolder or file). ESLint runs from the package root; a subfolder/file is linted
  as a relative target. Additional arguments are extra paths/globs relative to that same root.

Options:
  --only, -o IDS     run only these rules (comma-separated ESLint rule ids)
  --list-rules       print rule ids from eslint.rules.json and exit
  -h, --help         show this help

Environment:
  REFACTOR_METRICS_ONLY          same as --only if no --only on the command line
  REFACTOR_METRICS_NO_FAIL=1     always exit 0 while triaging
  REFACTOR_METRICS_FORMAT=json   JSON report on stdout
  REFACTOR_METRICS_JSON=path     write JSON report to path

Examples:
  ./scripts/analyze.js-ts.sh packages/vscode
  ./scripts/analyze.js-ts.sh packages/vscode/src
  ./scripts/analyze.js-ts.sh --only complexity packages/vscode/src
  ./scripts/analyze.js-ts.sh packages/vscode src
  ./scripts/analyze.js-ts.sh -o max-depth,@typescript-eslint/no-floating-promises \\
      packages/vscode
EOF
}

list_rules() {
  RULES_JSON="${RULES_JSON}" node -e '
    const fs = require("fs");
    const j = JSON.parse(fs.readFileSync(process.env.RULES_JSON, "utf8"));
    console.log(Object.keys(j).sort().join("\n"));
  '
}

if [[ "${1:-}" == "--list-rules" ]]; then
  list_rules
  exit 0
fi

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

only_linters="${REFACTOR_METRICS_ONLY:-}"
eslint_extra=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --only=*)
      only_linters="${1#*=}"
      shift
      ;;
    --only | -o)
      if [[ -z "${2:-}" ]]; then
        echo "${0##*/}: --only requires a rule id (comma-separated for several)" >&2
        exit 2
      fi
      only_linters="$2"
      shift 2
      ;;
    --)
      shift
      eslint_extra+=("$@")
      break
      ;;
    -*)
      echo "${0##*/}: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      break
      ;;
  esac
done

# Default to repo root so running with no arguments scans the entire repo.
primary_arg="${1:-${REPO_ROOT}}"
if [[ $# -ge 1 ]]; then
  shift
fi
if [[ $# -gt 0 ]]; then
  eslint_extra+=("$@")
fi

primary_resolved="${primary_arg}"
if [[ "${primary_resolved}" != /* ]]; then
  primary_resolved="${REPO_ROOT}/${primary_resolved}"
fi
# Strip trailing slash for stable path handling (except root).
if [[ -n "${primary_resolved}" && "${primary_resolved}" != "/" ]]; then
  primary_resolved="${primary_resolved%/}"
fi

if [[ ! -e "${primary_resolved}" ]]; then
  echo "${0##*/}: path does not exist: ${primary_resolved}" >&2
  exit 2
fi

if ! resolved=$(find_npm_package_root "${primary_resolved}"); then
  echo "${0##*/}: no package.json found in \"${primary_resolved}\" or its parent directories" >&2
  exit 2
fi

if [[ -d "${primary_resolved}" ]]; then
  abs_primary=$(cd -- "${primary_resolved}" &>/dev/null && pwd)
else
  abs_primary="$(cd -- "$(dirname -- "${primary_resolved}")" &>/dev/null && pwd)/$(basename "${primary_resolved}")"
fi

eslint_targets=()
if [[ "${abs_primary}" == "${resolved}" ]]; then
  if [[ ${#eslint_extra[@]} -eq 0 ]]; then
    eslint_targets=(.)
  else
    eslint_targets=("${eslint_extra[@]}")
  fi
else
  rel=$(relpath_under "${resolved}" "${abs_primary}")
  if [[ ${#eslint_extra[@]} -eq 0 ]]; then
    eslint_targets=("${rel}")
  else
    eslint_targets=("${rel}" "${eslint_extra[@]}")
  fi
fi

if [[ ! -f "${CONFIG_ABS}" || ! -f "${RULES_JSON}" ]]; then
  echo "${0##*/}: missing ${CONFIG_ABS} or ${RULES_JSON}" >&2
  exit 2
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found. Install Node.js (includes npm/npx)." >&2
  exit 127
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node.js (includes npm/npx)." >&2
  exit 127
fi

package_is_resolvable() {
  local package_name="$1"
  # Use Node's own resolution (walks up through parent node_modules) so this also works with
  # npm/yarn/pnpm workspace hoisting, where the package may not live directly in "${resolved}/node_modules".
  node -e "require.resolve(process.argv[1] + '/package.json', { paths: [process.argv[2]] })" \
    "${package_name}" "${resolved}" >/dev/null 2>&1
}

join_with_spaces() {
  local IFS=' '
  echo "$*"
}

ensure_eslint_runtime_dependencies() {
  local required_packages=(eslint typescript-eslint)
  local missing_packages=()
  local package_name
  local install_cmd=(npm install --ignore-scripts --no-audit --no-fund)
  local missing_display
  local install_display

  for package_name in "${required_packages[@]}"; do
    if ! package_is_resolvable "${package_name}"; then
      missing_packages+=("${package_name}")
    fi
  done

  if [[ ${#missing_packages[@]} -eq 0 ]]; then
    return 0
  fi

  if [[ -f "${resolved}/package-lock.json" ]]; then
    install_cmd=(npm ci --ignore-scripts --no-audit --no-fund)
  fi

  missing_display=$(join_with_spaces "${missing_packages[@]}")
  install_display=$(join_with_spaces "${install_cmd[@]}")
  echo "${0##*/}: missing ${missing_display} under ${resolved}; bootstrapping dependencies with ${install_display}" >&2
  (
    cd "${resolved}" \
      && "${install_cmd[@]}"
  )

  for package_name in "${required_packages[@]}"; do
    if ! package_is_resolvable "${package_name}"; then
      echo "${0##*/}: ${package_name} is still not resolvable from ${resolved} after ${install_display}." >&2
      exit 1
    fi
  done
}

# Optional: validate --only rule names before ESLint loads the flat config
if [[ -n "${only_linters}" ]]; then
  IFS=',' read -r -a _only_arr <<<"${only_linters}"
  for raw_id in "${_only_arr[@]}"; do
    id="${raw_id//[[:space:]]/}"
    [[ -z "${id}" ]] && continue
    if ! list_rules | grep -Fxq "${id}"; then
      echo "${0##*/}: unknown rule id \"${id}\". Use --list-rules." >&2
      exit 2
    fi
  done
fi

export ESLINT_REFACTOR_METRICS_ONLY="${only_linters}"

ensure_eslint_runtime_dependencies

eslint_cmd=(npx eslint --no-config-lookup -c "${CONFIG_ABS}" --max-warnings 0)

if [[ "${REFACTOR_METRICS_FORMAT:-}" == "json" ]]; then
  eslint_cmd+=(-f json)
  if [[ -n "${REFACTOR_METRICS_JSON:-}" ]]; then
    echo "${0##*/}: use either REFACTOR_METRICS_FORMAT=json or REFACTOR_METRICS_JSON, not both." >&2
    exit 2
  fi
elif [[ -n "${REFACTOR_METRICS_JSON:-}" ]]; then
  eslint_cmd+=(-f json -o "${REFACTOR_METRICS_JSON}")
  mkdir -p "$(dirname "${REFACTOR_METRICS_JSON}")"
fi

eslint_cmd+=("${eslint_targets[@]}")

run_eslint() {
  (cd "${resolved}" && exec "${eslint_cmd[@]}")
}

# Treat lint findings as non-blocking unless BUILD_STOP_ON_LINT_FINDINGS=1.
if [[ "${BUILD_STOP_ON_LINT_FINDINGS:-0}" != "1" ]]; then
  REFACTOR_METRICS_NO_FAIL=1
fi

status=0
if [[ "${REFACTOR_METRICS_NO_FAIL:-}" == "1" ]]; then
  run_eslint || status=0
else
  run_eslint || status=$?
fi
exit "${status}"
