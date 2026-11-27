#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

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
Postgres/ClickHouse migrations on main), selects the next semantic version, and
dispatches the GitHub Actions release workflow (`cut-release.yml`) in the `oss-release`
environment.
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
    fail "Working tree has uncommitted changes. Commit or stash them so the version preview matches HEAD."
  fi
}

preview_field() {
  local bump="$1"
  local field="$2"
  local custom_version="${3:-}"
  node "${SCRIPT_DIR}/bump-release-version.mjs" \
    --root "$REPO_ROOT" \
    --bump "$bump" \
    --custom-version "$custom_version" \
    --dry-run \
    --field "$field"
}

prompt_version_choice() {
  local current_version="$1"
  local branch="$2"
  local expected_sha="$3"
  local patch_preview minor_preview major_preview choice

  patch_preview="$(preview_field patch nextVersion)"
  minor_preview="$(preview_field minor nextVersion)"
  major_preview="$(preview_field major nextVersion)"

  echo
  log "Current version: v${current_version} (branch: ${branch}, HEAD: ${expected_sha:0:10})"
  echo "Select release version:"
  echo "  1) patch  -> v${patch_preview}"
  echo "  2) minor  -> v${minor_preview}"
  echo "  3) major  -> v${major_preview}"
  echo "  4) custom -> enter explicit semver"
  read -r -p "Choice [1-4]: " choice

  case "$choice" in
    1 | patch) ARG_BUMP="patch" ;;
    2 | minor) ARG_BUMP="minor" ;;
    3 | major) ARG_BUMP="major" ;;
    4 | custom)
      ARG_BUMP="custom"
      read -r -p "Enter target semver (e.g. ${minor_preview} or ${minor_preview}-rc.1): " ARG_CUSTOM_VERSION
      ;;
    *)
      fail "Invalid selection '${choice}'. Aborting release."
      ;;
  esac
}

confirm_major_bump() {
  local current_version="$1"
  local tag_name="$2"

  echo
  log "Major version bump requested: v${current_version} -> ${tag_name}"
  read -r -p "Type '${MAJOR_CONFIRMATION_TOKEN}' to confirm: " CONFIRMED_MAJOR
  if [[ "$CONFIRMED_MAJOR" != "$MAJOR_CONFIRMATION_TOKEN" ]]; then
    fail "Major release confirmation failed. Aborting release."
  fi
}

dispatch_release_workflow() {
  local branch="$1"
  local expected_sha="$2"
  local current_version="$3"
  local tag_name="$4"

  echo
  log "Dispatching '${RELEASE_WORKFLOW_FILE}' on branch '${branch}':"
  log "  Version:    v${current_version} -> ${tag_name} (${ARG_BUMP})"
  log "  HEAD SHA:   ${expected_sha}"
  log "  Migrations: ${PREFLIGHT_MIGRATIONS_CONFIRMED}"
  log "  Dry run:    ${ARG_DRY_RUN}"

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

  gh "${gh_args[@]}"

  echo
  log "Workflow dispatched. Track and approve the 'oss-release' gate at:"
  log "  https://github.com/langfuse/langfuse/actions/workflows/${RELEASE_WORKFLOW_FILE}"
  log "Note: another maintainer must approve the 'oss-release' environment before the version commit and tag are pushed."
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

  local branch expected_sha current_version tag_name is_major_bump
  branch="$(current_branch)"
  expected_sha="$(git rev-parse HEAD)"
  current_version="$(node "${SCRIPT_DIR}/bump-release-version.mjs" --root "$REPO_ROOT" --print-current)"

  if [[ -z "$ARG_BUMP" ]]; then
    prompt_version_choice "$current_version" "$branch" "$expected_sha"
  fi

  tag_name="$(preview_field "$ARG_BUMP" tagName "$ARG_CUSTOM_VERSION")"
  is_major_bump="$(preview_field "$ARG_BUMP" isMajorBump "$ARG_CUSTOM_VERSION")"

  if [[ "$is_major_bump" == "true" ]]; then
    confirm_major_bump "$current_version" "$tag_name"
  fi

  dispatch_release_workflow "$branch" "$expected_sha" "$current_version" "$tag_name"
}

main "$@"
