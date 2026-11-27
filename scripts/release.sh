#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LOG_PREFIX="release"
# shellcheck source=scripts/release-preflight.sh
source "${SCRIPT_DIR}/release-preflight.sh"

RELEASE_WORKFLOW_FILE="cut-release.yml"
MAJOR_CONFIRMATION_TOKEN="RELEASE MAJOR"

ARG_BUMP=""
ARG_CUSTOM_VERSION=""
ARG_DRY_RUN="false"
CONFIRMED_MAJOR=""

usage() {
  cat <<'EOF'
Usage: pnpm run release [-- <patch|minor|major>] [--version <semver>] [--dry-run]

Runs release preflight checks (branch, clean working tree, origin sync, and unpromoted
Postgres/ClickHouse migrations on main) and dispatches the release GitHub Actions workflow.
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      patch | minor | major)
        if [[ -n "$ARG_BUMP" ]]; then
          fail "Version bump already set to '${ARG_BUMP}'."
        fi
        ARG_BUMP="$1"
        shift
        ;;
      --version)
        if [[ $# -lt 2 ]]; then
          fail "--version requires a semver argument (e.g. 4.89.0 or 4.89.0-rc.1)."
        fi
        if [[ -n "$ARG_BUMP" ]]; then
          fail "Version bump already set to '${ARG_BUMP}'."
        fi
        ARG_BUMP="custom"
        ARG_CUSTOM_VERSION="$2"
        shift 2
        ;;
      --dry-run)
        ARG_DRY_RUN="true"
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      --)
        shift
        ;;
      *)
        fail "Unknown argument '$1'. Run with --help for usage."
        ;;
    esac
  done
}

ensure_clean_working_tree() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    fail "Working tree has uncommitted changes. Commit or stash them before releasing."
  fi
}

prompt_version_choice() {
  local current_version="$1"
  local branch="$2"
  local expected_sha="$3"
  local choice

  echo
  log "Current version: v${current_version} (branch: ${branch}, HEAD: ${expected_sha:0:10})"
  echo "Select version bump:"
  echo "  1) patch"
  echo "  2) minor"
  echo "  3) major"
  echo "  4) custom (explicit semver)"
  read -r -p "Choice [1-4]: " choice

  case "$choice" in
    1 | patch) ARG_BUMP="patch" ;;
    2 | minor) ARG_BUMP="minor" ;;
    3 | major) ARG_BUMP="major" ;;
    4 | custom)
      ARG_BUMP="custom"
      read -r -p "Enter target version (e.g. 4.89.0 or 4.89.0-rc.1): " ARG_CUSTOM_VERSION
      ;;
    *)
      fail "Invalid selection '${choice}'. Aborting release."
      ;;
  esac
}

validate_custom_version() {
  local current_version="$1"
  local target="${ARG_CUSTOM_VERSION#v}"
  CURRENT_VERSION="$current_version" TARGET_VERSION="$target" node <<'NODE'
const parse = (v) => {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(v);
  if (!m) throw new Error(`Invalid semver '${v}'.`);
  const pre = m[4] ? m[4].split(".") : [];
  for (const p of pre) {
    if (!p || (/^\d+$/.test(p) && p.length > 1 && p.startsWith("0"))) {
      throw new Error(`Invalid prerelease identifier in '${v}'.`);
    }
  }
  return { core: [+m[1], +m[2], +m[3]], pre };
};
const cmp = (a, b) => {
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i];
  if (!a.pre.length && !b.pre.length) return 0;
  if (!a.pre.length) return 1;
  if (!b.pre.length) return -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const [x, y] = [a.pre[i], b.pre[i]];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) return +x - +y;
    if (xn) return -1;
    if (yn) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
};
const cur = parse(process.env.CURRENT_VERSION);
const next = parse(process.env.TARGET_VERSION);
if (cmp(next, cur) <= 0) {
  throw new Error(`Target version '${process.env.TARGET_VERSION}' must be strictly greater than current version '${process.env.CURRENT_VERSION}'.`);
}
NODE
  ARG_CUSTOM_VERSION="$target"
}

is_major_bump() {
  local current_version="$1"
  if [[ "$ARG_BUMP" == "major" ]]; then
    return 0
  fi
  if [[ "$ARG_BUMP" == "custom" ]]; then
    local current_major target_major
    current_major="${current_version%%.*}"
    target_major="${ARG_CUSTOM_VERSION#v}"
    target_major="${target_major%%.*}"
    if [[ "$target_major" =~ ^[0-9]+$ && "$current_major" =~ ^[0-9]+$ && "$target_major" -gt "$current_major" ]]; then
      return 0
    fi
  fi
  return 1
}

confirm_major_bump() {
  echo
  log "Major version bump requested."
  read -r -p "Type '${MAJOR_CONFIRMATION_TOKEN}' to confirm: " CONFIRMED_MAJOR
  if [[ "$CONFIRMED_MAJOR" != "$MAJOR_CONFIRMATION_TOKEN" ]]; then
    fail "Major release confirmation failed. Aborting release."
  fi
}

dispatch_release_workflow() {
  local branch="$1"
  local expected_sha="$2"

  local -a gh_args=(
    workflow run "$RELEASE_WORKFLOW_FILE"
    --ref "$branch"
    -f "version=${ARG_BUMP}"
    -f "expected_sha=${expected_sha}"
    -f "confirm_migrations=${PREFLIGHT_MIGRATIONS_CONFIRMED}"
    -f "dry_run=${ARG_DRY_RUN}"
  )

  if [[ -n "$ARG_CUSTOM_VERSION" ]]; then
    gh_args+=(-f "custom_version=${ARG_CUSTOM_VERSION}")
  fi

  if [[ -n "$CONFIRMED_MAJOR" ]]; then
    gh_args+=(-f "confirm_major=${CONFIRMED_MAJOR}")
  fi

  log "Triggering workflow '${RELEASE_WORKFLOW_FILE}' on '${branch}' (bump=${ARG_BUMP}, dry_run=${ARG_DRY_RUN})..."
  gh "${gh_args[@]}"
  log "Workflow dispatched successfully."
}

main() {
  parse_args "$@"

  require_command gh
  require_command node

  if ! gh auth status >/dev/null 2>&1; then
    fail "GitHub CLI is not authenticated. Run 'gh auth login' and retry."
  fi

  ensure_clean_working_tree
  run_release_preflight

  local branch expected_sha current_version
  branch="$(current_branch)"
  expected_sha="$(git rev-parse HEAD)"
  current_version="$(node -p "require('./package.json').version")"

  if [[ -z "$ARG_BUMP" ]]; then
    prompt_version_choice "$current_version" "$branch" "$expected_sha"
  fi

  if [[ "$ARG_BUMP" == "custom" ]]; then
    validate_custom_version "$current_version"
  fi

  if is_major_bump "$current_version"; then
    confirm_major_bump
  fi

  dispatch_release_workflow "$branch" "$expected_sha"
}

main "$@"
