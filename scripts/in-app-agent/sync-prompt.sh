#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROMPT_FILE="${REPO_ROOT}/web/src/ee/features/in-app-agent/prompts/in-app-agent-system-prompt.txt"
PROMPT_NAME="in-app-agent-system-prompt"
REGIONS=(LOCAL STAGING EU US JP HIPAA)
BASE_URLS=(
  "${LANGFUSE_AI_FEATURES_LOCAL_BASE_URL:-http://localhost:3000}"
  "https://staging.langfuse.com"
  "https://cloud.langfuse.com"
  "https://us.cloud.langfuse.com"
  "https://jp.cloud.langfuse.com"
  "https://hipaa.cloud.langfuse.com"
)
IFS=" " read -r -a SELECTED_REGIONS <<< "${LANGFUSE_AI_FEATURES_SYNC_TARGETS:-${REGIONS[*]}}"

if [[ ! -f "${PROMPT_FILE}" ]]; then
  echo "Prompt file not found: ${PROMPT_FILE}" >&2
  exit 1
fi

PROMPT_CONTENT="$(<"${PROMPT_FILE}")"
REQUEST_BODY="$(
  jq -n \
    --arg name "${PROMPT_NAME}" \
    --arg prompt "${PROMPT_CONTENT}" \
    '{
      name: $name,
      type: "text",
      prompt: $prompt,
      labels: ["production", "latest"],
      commitMessage: "Sync in-app agent system prompt"
    }'
)"
SYNCED_REGIONS=()
PREFLIGHT_ERRORS=()

for REGION in "${SELECTED_REGIONS[@]}"; do
  REGION_INDEX="-1"
  for CANDIDATE_INDEX in "${!REGIONS[@]}"; do
    if [[ "${REGIONS[${CANDIDATE_INDEX}]}" == "${REGION}" ]]; then
      REGION_INDEX="${CANDIDATE_INDEX}"
      break
    fi
  done
  if [[ "${REGION_INDEX}" == "-1" ]]; then
    PREFLIGHT_ERRORS+=("${REGION}: unknown target. Expected one of: ${REGIONS[*]}.")
    continue
  fi

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

for REGION in "${SELECTED_REGIONS[@]}"; do
  REGION_INDEX="-1"
  for CANDIDATE_INDEX in "${!REGIONS[@]}"; do
    if [[ "${REGIONS[${CANDIDATE_INDEX}]}" == "${REGION}" ]]; then
      REGION_INDEX="${CANDIDATE_INDEX}"
      break
    fi
  done

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
