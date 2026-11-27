#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

LOG_PREFIX="release"
# shellcheck source=scripts/release-preflight.sh
source "${SCRIPT_DIR}/release-preflight.sh"

RELEASE_WORKFLOW_FILE="cut-release.yml"
MAJOR_CONFIRMATION_TOKEN="RELEASE MAJOR"

usage() {
  cat <<'EOF'
Usage: pnpm run release [-- <patch|minor|major>] [--version <semver>] [--dry-run]

Runs release preflight checks (branch, origin sync, and unpromoted Postgres/ClickHouse
migrations on main), selects the next semantic version, and dispatches the GitHub
Actions release workflow (`cut-release.yml`) in the `oss-release` environment.
EOF
}

preview_version() {
  local bump="$1"
  local custom_version="${2:-}"
  node "${SCRIPT_DIR}/bump-release-version.mjs" \
    --root "$REPO_ROOT" \
    --bump "$bump" \
    --custom-version "$custom_version" \
    --dry-run \
    --json
}

json_field() {
  local payload="$1"
  local field="$2"
  node -e '
    const data = JSON.parse(process.argv[1]);
    const val = data[process.argv[2]];
    process.stdout.write(val === undefined || val === null ? "" : String(val));
  ' "$payload" "$field"
}

main() {
  local bump=""
  local custom_version=""
  local dry_run="false"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      patch | minor | major)
        if [[ -n "$bump" ]]; then
          fail "Version bump already set to '${bump}'."
        fi
        bump="$1"
        shift
        ;;
      --version)
        if [[ $# -lt 2 ]]; then
          fail "--version requires a semver argument (e.g. 4.89.0 or 4.89.0-rc.1)."
        fi
        if [[ -n "$bump" ]]; then
          fail "Version bump already set to '${bump}'."
        fi
        bump="custom"
        custom_version="$2"
        shift 2
        ;;
      --dry-run)
        dry_run="true"
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

  require_command gh
  require_command node

  if ! gh auth status >/dev/null 2>&1; then
    fail "GitHub CLI is not authenticated. Run 'gh auth login' and retry."
  fi

  run_release_preflight

  local branch expected_sha current_version
  branch="$(current_branch)"
  expected_sha="$(git rev-parse HEAD)"
  current_version="$(node "${SCRIPT_DIR}/bump-release-version.mjs" --root "$REPO_ROOT" --print-current)"

  if [[ -z "$bump" ]]; then
    local patch_preview minor_preview major_preview choice
    patch_preview="$(json_field "$(preview_version patch)" nextVersion)"
    minor_preview="$(json_field "$(preview_version minor)" nextVersion)"
    major_preview="$(json_field "$(preview_version major)" nextVersion)"

    echo
    log "Current version: v${current_version} (branch: ${branch}, HEAD: ${expected_sha:0:10})"
    echo "Select release version:"
    echo "  1) patch  -> v${patch_preview}"
    echo "  2) minor  -> v${minor_preview}"
    echo "  3) major  -> v${major_preview}"
    echo "  4) custom -> enter explicit semver"
    read -r -p "Choice [1-4]: " choice

    case "$choice" in
      1 | patch) bump="patch" ;;
      2 | minor) bump="minor" ;;
      3 | major) bump="major" ;;
      4 | custom)
        bump="custom"
        read -r -p "Enter target semver (e.g. ${minor_preview} or ${minor_preview}-rc.1): " custom_version
        ;;
      *)
        fail "Invalid selection '${choice}'. Aborting release."
        ;;
    esac
  fi

  local preview_json next_version tag_name is_major_bump
  preview_json="$(preview_version "$bump" "$custom_version")"
  next_version="$(json_field "$preview_json" nextVersion)"
  tag_name="$(json_field "$preview_json" tagName)"
  is_major_bump="$(json_field "$preview_json" isMajorBump)"

  local confirm_major=""
  if [[ "$is_major_bump" == "true" ]]; then
    echo
    log "Major version bump requested: v${current_version} -> ${tag_name}"
    read -r -p "Type '${MAJOR_CONFIRMATION_TOKEN}' to confirm: " confirm_major
    if [[ "$confirm_major" != "$MAJOR_CONFIRMATION_TOKEN" ]]; then
      fail "Major release confirmation failed. Aborting release."
    fi
  fi

  echo
  log "Dispatching '${RELEASE_WORKFLOW_FILE}' on branch '${branch}':"
  log "  Version:    v${current_version} -> ${tag_name} (${bump})"
  log "  HEAD SHA:   ${expected_sha}"
  log "  Migrations: ${PREFLIGHT_MIGRATIONS_CONFIRMED}"
  log "  Dry run:    ${dry_run}"

  local -a gh_args=(
    workflow run "$RELEASE_WORKFLOW_FILE"
    --ref "$branch"
    -f "version=${bump}"
    -f "expected_sha=${expected_sha}"
    -f "confirm_migrations=${PREFLIGHT_MIGRATIONS_CONFIRMED}"
    -f "dry_run=${dry_run}"
  )

  if [[ -n "$custom_version" ]]; then
    gh_args+=(-f "custom_version=${custom_version}")
  fi

  if [[ -n "$confirm_major" ]]; then
    gh_args+=(-f "confirm_major=${confirm_major}")
  fi

  gh "${gh_args[@]}"

  echo
  log "Workflow dispatched. Track and approve the 'oss-release' gate at:"
  log "  https://github.com/langfuse/langfuse/actions/workflows/${RELEASE_WORKFLOW_FILE}"
  log "Note: another maintainer must approve the 'oss-release' environment before the version commit and tag are pushed."
}

main "$@"
