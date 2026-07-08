#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the same safety gates as the `release` target before promoting to cloud.
# release-preflight.sh exposes log/fail/require_command and run_release_preflight.
LOG_PREFIX="release:cloud"
# shellcheck source=scripts/release-preflight.sh
source "${SCRIPT_DIR}/release-preflight.sh"

PROMOTION_WORKFLOW_FILE="promote-main-to-production.yml"

trigger_cloud_promotion() {
  require_command gh

  if ! gh auth status >/dev/null 2>&1; then
    fail "GitHub CLI is not authenticated. Run 'gh auth login' and retry."
  fi

  log "Triggering workflow '${PROMOTION_WORKFLOW_FILE}'..."
  gh workflow run "$PROMOTION_WORKFLOW_FILE" --ref main -f confirm=promote
  log "Workflow dispatched successfully."
}

main() {
  run_release_preflight
  trigger_cloud_promotion
}

main "$@"
