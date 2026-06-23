#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
EVALUATOR_DIR="${REPO_ROOT}/web/src/features/in-app-agent/evaluators"
EVALUATOR_FILES=("${EVALUATOR_DIR}"/*-evaluator.json)
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

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but was not found on PATH." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but was not found on PATH." >&2
  exit 1
fi

if [[ ${#EVALUATOR_FILES[@]} -eq 0 ]]; then
  echo "No evaluator files found in ${EVALUATOR_DIR}." >&2
  exit 1
fi

join_by_comma() {
  local joined=""

  for value in "$@"; do
    if [[ -z "${joined}" ]]; then
      joined="${value}"
    else
      joined="${joined}, ${value}"
    fi
  done

  printf '%s' "${joined}"
}

print_response_body() {
  local response_body="$1"

  if [[ -s "${response_body}" ]]; then
    jq . "${response_body}" >&2 2>/dev/null || cat "${response_body}" >&2
    echo >&2
  fi
}

find_region_index() {
  local region="$1"

  for candidate_index in "${!REGIONS[@]}"; do
    if [[ "${REGIONS[${candidate_index}]}" == "${region}" ]]; then
      printf '%s' "${candidate_index}"
      return 0
    fi
  done

  return 1
}

EVALUATOR_NAMES=()
EVALUATOR_REQUEST_BODIES=()
EVALUATION_RULE_NAMES=()
EVALUATION_RULE_REQUEST_BODIES=()
EVALUATION_RULE_PATCH_BODIES=()

for EVALUATOR_FILE in "${EVALUATOR_FILES[@]}"; do
  EVALUATION_RULE_FILE="${EVALUATOR_FILE%-evaluator.json}-evaluation-rule.json"

  if [[ ! -f "${EVALUATION_RULE_FILE}" ]]; then
    echo "Evaluation rule file not found for ${EVALUATOR_FILE}: ${EVALUATION_RULE_FILE}" >&2
    exit 1
  fi

  EVALUATOR_REQUEST_BODY="$(
    jq -c '
      if (.name | type) != "string" or (.name | length) == 0 then
        error("Evaluator must include a non-empty string name")
      elif .type != "llm_as_judge" then
        error("Only llm_as_judge evaluator sync is supported by this script")
      elif (.prompt | type) != "string" or (.prompt | length) == 0 then
        error("Evaluator must include a non-empty prompt")
      elif (.outputDefinition | type) != "object" then
        error("Evaluator must include an outputDefinition object")
      else
        .
      end
    ' "${EVALUATOR_FILE}"
  )"
  EVALUATOR_NAME="$(jq -r '.name' <<<"${EVALUATOR_REQUEST_BODY}")"

  EVALUATION_RULE_REQUEST_BODY="$(
    jq -c --arg evaluator_name "${EVALUATOR_NAME}" '
      if (.name | type) != "string" or (.name | length) == 0 then
        error("Evaluation rule must include a non-empty string name")
      elif (.evaluator | type) != "object" then
        error("Evaluation rule must include an evaluator object")
      elif .evaluator.name != $evaluator_name then
        error("Evaluation rule evaluator.name must match evaluator name")
      elif .evaluator.scope != "project" then
        error("Evaluation rule evaluator.scope must be project")
      elif .evaluator.type != "llm_as_judge" then
        error("Evaluation rule evaluator.type must be llm_as_judge")
      elif .target != "observation" then
        error("Only observation evaluation rules are supported by this script")
      elif (.filter | type) != "array" then
        error("Evaluation rule must include a filter array")
      elif (.mapping | type) != "array" then
        error("Evaluation rule must include a mapping array")
      else
        .
      end
    ' "${EVALUATION_RULE_FILE}"
  )"
  EVALUATION_RULE_PATCH_BODY="$(
    jq -c '.evaluator |= { name, scope }' <<<"${EVALUATION_RULE_REQUEST_BODY}"
  )"
  EVALUATION_RULE_NAME="$(jq -r '.name' <<<"${EVALUATION_RULE_REQUEST_BODY}")"

  EVALUATOR_NAMES+=("${EVALUATOR_NAME}")
  EVALUATOR_REQUEST_BODIES+=("${EVALUATOR_REQUEST_BODY}")
  EVALUATION_RULE_NAMES+=("${EVALUATION_RULE_NAME}")
  EVALUATION_RULE_REQUEST_BODIES+=("${EVALUATION_RULE_REQUEST_BODY}")
  EVALUATION_RULE_PATCH_BODIES+=("${EVALUATION_RULE_PATCH_BODY}")
done

EVALUATOR_LIST="$(join_by_comma "${EVALUATOR_NAMES[@]}")"
SYNCED_REGIONS=()
PREFLIGHT_ERRORS=()

for REGION in "${SELECTED_REGIONS[@]}"; do
  if ! REGION_INDEX="$(find_region_index "${REGION}")"; then
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

  echo "Checking evaluator API access in ${REGION} (${BASE_URL})..."
  EVALUATORS_STATUS_CODE="$(
    curl --silent --show-error --output /dev/null --write-out "%{http_code}" \
      --user "${!PUBLIC_KEY_VAR}:${!SECRET_KEY_VAR}" \
      "${BASE_URL}/api/public/unstable/evaluators?page=1&limit=1" || true
  )"

  if [[ "${EVALUATORS_STATUS_CODE}" != "200" ]]; then
    PREFLIGHT_ERRORS+=("${REGION}: expected 200 from ${BASE_URL}/api/public/unstable/evaluators, got ${EVALUATORS_STATUS_CODE}.")
    continue
  fi

  EVALUATION_RULES_STATUS_CODE="$(
    curl --silent --show-error --output /dev/null --write-out "%{http_code}" \
      --user "${!PUBLIC_KEY_VAR}:${!SECRET_KEY_VAR}" \
      "${BASE_URL}/api/public/unstable/evaluation-rules?page=1&limit=1" || true
  )"

  if [[ "${EVALUATION_RULES_STATUS_CODE}" != "200" ]]; then
    PREFLIGHT_ERRORS+=("${REGION}: expected 200 from ${BASE_URL}/api/public/unstable/evaluation-rules, got ${EVALUATION_RULES_STATUS_CODE}.")
    continue
  fi

  echo "Evaluator and evaluation-rule API access checks passed for ${REGION} (${BASE_URL})."
done

if [[ ${#PREFLIGHT_ERRORS[@]} -gt 0 ]]; then
  echo "Preflight failed; no regions synced." >&2
  printf ' - %s\n' "${PREFLIGHT_ERRORS[@]}" >&2
  exit 1
fi

for REGION in "${SELECTED_REGIONS[@]}"; do
  REGION_INDEX="$(find_region_index "${REGION}")"
  PUBLIC_KEY_VAR="LANGFUSE_AI_FEATURES_${REGION}_PUBLIC_KEY"
  SECRET_KEY_VAR="LANGFUSE_AI_FEATURES_${REGION}_SECRET_KEY"
  BASE_URL="${BASE_URLS[${REGION_INDEX}]}"

  read -r -p "Sync evaluators (${EVALUATOR_LIST}) and processing rules in ${REGION} (${BASE_URL})? [y/N] " CONFIRM
  if [[ ! "${CONFIRM}" =~ ^[Yy]([Ee][Ss])?$ ]]; then
    echo "Skipped ${REGION}."
    continue
  fi

  for EVALUATOR_INDEX in "${!EVALUATOR_NAMES[@]}"; do
    EVALUATOR_NAME="${EVALUATOR_NAMES[${EVALUATOR_INDEX}]}"
    EVALUATOR_REQUEST_BODY="${EVALUATOR_REQUEST_BODIES[${EVALUATOR_INDEX}]}"
    EVALUATION_RULE_NAME="${EVALUATION_RULE_NAMES[${EVALUATOR_INDEX}]}"
    EVALUATION_RULE_REQUEST_BODY="${EVALUATION_RULE_REQUEST_BODIES[${EVALUATOR_INDEX}]}"
    EVALUATION_RULE_PATCH_BODY="${EVALUATION_RULE_PATCH_BODIES[${EVALUATOR_INDEX}]}"

    echo "Creating ${EVALUATOR_NAME} or adding a new version in ${REGION} (${BASE_URL})..."

    RESPONSE_BODY="$(mktemp)"
    STATUS_CODE="$(
      curl --silent --show-error \
        --output "${RESPONSE_BODY}" \
        --write-out "%{http_code}" \
        --user "${!PUBLIC_KEY_VAR}:${!SECRET_KEY_VAR}" \
        --header "Content-Type: application/json" \
        --request POST \
        --data "${EVALUATOR_REQUEST_BODY}" \
        "${BASE_URL}/api/public/unstable/evaluators" || true
    )"

    if [[ "${STATUS_CODE}" -lt 200 || "${STATUS_CODE}" -ge 300 ]]; then
      echo "Failed to sync ${EVALUATOR_NAME} in ${REGION} (${BASE_URL}); status ${STATUS_CODE}." >&2
      print_response_body "${RESPONSE_BODY}"
      rm -f "${RESPONSE_BODY}"
      exit 1
    fi

    rm -f "${RESPONSE_BODY}"

    echo "Created ${EVALUATOR_NAME} or added a new version in ${REGION} (${BASE_URL})."
    echo "Creating or updating evaluation rule ${EVALUATION_RULE_NAME} in ${REGION} (${BASE_URL})..."

    RULE_LIST_BODY="$(mktemp)"
    STATUS_CODE="$(
      curl --silent --show-error \
        --output "${RULE_LIST_BODY}" \
        --write-out "%{http_code}" \
        --user "${!PUBLIC_KEY_VAR}:${!SECRET_KEY_VAR}" \
        "${BASE_URL}/api/public/unstable/evaluation-rules?page=1&limit=100" || true
    )"

    if [[ "${STATUS_CODE}" -lt 200 || "${STATUS_CODE}" -ge 300 ]]; then
      echo "Failed to list evaluation rules in ${REGION} (${BASE_URL}); status ${STATUS_CODE}." >&2
      print_response_body "${RULE_LIST_BODY}"
      rm -f "${RULE_LIST_BODY}"
      exit 1
    fi

    EVALUATION_RULE_ID="$(
      jq -r --arg name "${EVALUATION_RULE_NAME}" '
        [.data[] | select(.name == $name) | .id][0] // empty
      ' "${RULE_LIST_BODY}"
    )"
    rm -f "${RULE_LIST_BODY}"

    RESPONSE_BODY="$(mktemp)"
    if [[ -n "${EVALUATION_RULE_ID}" ]]; then
      STATUS_CODE="$(
        curl --silent --show-error \
          --output "${RESPONSE_BODY}" \
          --write-out "%{http_code}" \
          --user "${!PUBLIC_KEY_VAR}:${!SECRET_KEY_VAR}" \
          --header "Content-Type: application/json" \
          --request PATCH \
          --data "${EVALUATION_RULE_PATCH_BODY}" \
          "${BASE_URL}/api/public/unstable/evaluation-rules/${EVALUATION_RULE_ID}" || true
      )"
      RULE_ACTION="update"
    else
      STATUS_CODE="$(
        curl --silent --show-error \
          --output "${RESPONSE_BODY}" \
          --write-out "%{http_code}" \
          --user "${!PUBLIC_KEY_VAR}:${!SECRET_KEY_VAR}" \
          --header "Content-Type: application/json" \
          --request POST \
          --data "${EVALUATION_RULE_REQUEST_BODY}" \
          "${BASE_URL}/api/public/unstable/evaluation-rules" || true
      )"
      RULE_ACTION="create"
    fi

    if [[ "${STATUS_CODE}" -lt 200 || "${STATUS_CODE}" -ge 300 ]]; then
      echo "Failed to ${RULE_ACTION} evaluation rule ${EVALUATION_RULE_NAME} in ${REGION} (${BASE_URL}); status ${STATUS_CODE}." >&2
      print_response_body "${RESPONSE_BODY}"
      rm -f "${RESPONSE_BODY}"
      exit 1
    fi

    rm -f "${RESPONSE_BODY}"

    if [[ -n "${EVALUATION_RULE_ID}" ]]; then
      echo "Updated evaluation rule ${EVALUATION_RULE_NAME} in ${REGION} (${BASE_URL})."
    else
      echo "Created evaluation rule ${EVALUATION_RULE_NAME} in ${REGION} (${BASE_URL})."
    fi
  done

  SYNCED_REGIONS+=("${REGION}")
done

if [[ ${#SYNCED_REGIONS[@]} -eq 0 ]]; then
  echo "No regions synced."
else
  echo "Synced evaluators (${EVALUATOR_LIST}) and processing rules to regions: ${SYNCED_REGIONS[*]}."
fi
