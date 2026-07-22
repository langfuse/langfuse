#!/usr/bin/env bash
set -euo pipefail

# Pushes the repo-versioned v4 search-bar Ask AI filter prompt
# (web/src/features/search-bar/server/prompts/search-bar-filter.prompt.json)
# as a new version of the MANAGED chat prompt "search-bar-filter" in the
# AI-features Langfuse project, per region. Mirrors
# scripts/in-app-agent/sync-prompt.sh (a text prompt); this one is a chat
# prompt, so the request body is the JSON file's contents as-is — it is
# already shaped like the `POST /api/public/v2/prompts` request body
# (name/type/prompt/labels/commitMessage).
#
# Intended for a human to run locally with real AI-features keys. Never run
# by an agent, and never wired into CI.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROMPT_FILE="${REPO_ROOT}/web/src/features/search-bar/server/prompts/search-bar-filter.prompt.json"
REGIONS=(STAGING EU US JP HIPAA)
BASE_URLS=(
  "https://staging.langfuse.com"
  "https://cloud.langfuse.com"
  "https://us.cloud.langfuse.com"
  "https://jp.cloud.langfuse.com"
  "https://hipaa.cloud.langfuse.com"
)

if [[ ! -f "${PROMPT_FILE}" ]]; then
  echo "Prompt file not found: ${PROMPT_FILE}" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

REQUEST_BODY="$(jq -c '.' "${PROMPT_FILE}")"

# The seed file's `.name` is the single source of truth for the managed
# prompt's name — kept in sync with the TS constant
# (`SEARCH_BAR_FILTER_PROMPT_NAME` in `resolveFilterPrompt.ts`) by a test,
# not by a second literal here. A rename in one place therefore can't
# silently desync the two and degrade every request to permanent fallback.
PROMPT_NAME="$(jq -r '.name' <<<"${REQUEST_BODY}")"
if [[ -z "${PROMPT_NAME}" || "${PROMPT_NAME}" == "null" ]]; then
  echo "Prompt file must have a non-empty 'name'." >&2
  exit 1
fi
if [[ "$(jq -r '.type' <<<"${REQUEST_BODY}")" != "chat" ]]; then
  echo "Prompt file 'type' must be 'chat'." >&2
  exit 1
fi

SYNCED_REGIONS=()
PREFLIGHT_ERRORS=()

for REGION_INDEX in "${!REGIONS[@]}"; do
  REGION="${REGIONS[${REGION_INDEX}]}"
  PUBLIC_KEY_VAR="LANGFUSE_AI_FEATURES_${REGION}_PUBLIC_KEY"
  SECRET_KEY_VAR="LANGFUSE_AI_FEATURES_${REGION}_SECRET_KEY"
  BASE_URL="${BASE_URLS[${REGION_INDEX}]}"

  if [[ -z "${!PUBLIC_KEY_VAR:-}" || -z "${!SECRET_KEY_VAR:-}" ]]; then
    PREFLIGHT_ERRORS+=("${REGION}: ${PUBLIC_KEY_VAR} and ${SECRET_KEY_VAR} must be set.")
    continue
  fi

  echo "Checking access to ${REGION} (${BASE_URL})..."
  STATUS_CODE="$(
    curl --silent --show-error --output /dev/null --write-out "%{http_code}" \
      --user "${!PUBLIC_KEY_VAR}:${!SECRET_KEY_VAR}" \
      "${BASE_URL}/api/public/v2/prompts/${PROMPT_NAME}" || true
  )"

  if [[ "${STATUS_CODE}" != "200" && "${STATUS_CODE}" != "404" ]]; then
    PREFLIGHT_ERRORS+=("${REGION}: expected 200 or 404 from ${BASE_URL}, got ${STATUS_CODE}.")
    continue
  fi

  echo "Access check passed for ${REGION} (${BASE_URL})."
done

if [[ ${#PREFLIGHT_ERRORS[@]} -gt 0 ]]; then
  echo "Preflight failed; no regions synced." >&2
  printf ' - %s\n' "${PREFLIGHT_ERRORS[@]}" >&2
  exit 1
fi

for REGION_INDEX in "${!REGIONS[@]}"; do
  REGION="${REGIONS[${REGION_INDEX}]}"
  PUBLIC_KEY_VAR="LANGFUSE_AI_FEATURES_${REGION}_PUBLIC_KEY"
  SECRET_KEY_VAR="LANGFUSE_AI_FEATURES_${REGION}_SECRET_KEY"
  BASE_URL="${BASE_URLS[${REGION_INDEX}]}"

  read -r -p "Create or add a new version of ${PROMPT_NAME} in ${REGION} (${BASE_URL})? [y/N] " CONFIRM
  if [[ ! "${CONFIRM}" =~ ^[Yy]([Ee][Ss])?$ ]]; then
    echo "Skipped ${REGION}."
    continue
  fi

  echo "Creating ${PROMPT_NAME} or adding a new version in ${REGION} (${BASE_URL})..."

  curl --fail --silent --show-error \
    --user "${!PUBLIC_KEY_VAR}:${!SECRET_KEY_VAR}" \
    --header "Content-Type: application/json" \
    --request POST \
    --data "${REQUEST_BODY}" \
    "${BASE_URL}/api/public/v2/prompts" >/dev/null

  echo "Created ${PROMPT_NAME} or added a new version in ${REGION} (${BASE_URL})."
  SYNCED_REGIONS+=("${REGION}")
done

if [[ ${#SYNCED_REGIONS[@]} -eq 0 ]]; then
  echo "No regions synced."
else
  echo "Synced ${PROMPT_NAME} to regions: ${SYNCED_REGIONS[*]}."
fi
