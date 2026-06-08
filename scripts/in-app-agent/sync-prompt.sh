#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROMPT_FILE="${REPO_ROOT}/web/src/features/in-app-agent/prompts/in-app-agent-system-prompt.txt"
PROMPT_NAME="in-app-agent-system-prompt"
REGIONS=(EU US JP HIPAA)
BASE_URLS=(
  "https://cloud.langfuse.com"
  "https://us.cloud.langfuse.com"
  "https://jp.cloud.langfuse.com"
  "https://hipaa.cloud.langfuse.com"
)

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

  if [[ -z "${!PUBLIC_KEY_VAR:-}" || -z "${!SECRET_KEY_VAR:-}" ]]; then
    echo "${PUBLIC_KEY_VAR} and ${SECRET_KEY_VAR} must be set." >&2
    exit 1
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
