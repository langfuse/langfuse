#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
TEST_ENV_FILE="${REPO_ROOT}/.env.test"

WORKTREE_ID_ARG=""
BOOTSTRAP_WORKTREE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id)
      WORKTREE_ID_ARG="$2"
      shift 2
      ;;
    --bootstrap)
      BOOTSTRAP_WORKTREE=true
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: $0 [--id <worktree-id>] [--bootstrap]"
      exit 1
      ;;
  esac
done

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${REPO_ROOT}/.env.dev.example" "${ENV_FILE}"
fi

if [[ ! -f "${TEST_ENV_FILE}" ]]; then
  cp "${REPO_ROOT}/.env.test.example" "${TEST_ENV_FILE}"
fi

to_slug() {
  local value="$1"
  value="$(echo "${value}" | tr '[:upper:]' '[:lower:]')"
  value="$(echo "${value}" | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//')"
  if [[ -z "${value}" ]]; then
    value="wt"
  fi
  echo "${value}"
}

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  echo "${value}"
}

read_env_value() {
  local file="$1"
  local key="$2"
  local default_value="$3"

  local line
  line="$(grep -E "^${key}=" "${file}" | tail -n 1 || true)"
  if [[ -z "${line}" ]]; then
    echo "${default_value}"
    return
  fi

  local raw="${line#*=}"
  raw="$(trim_quotes "${raw}")"
  if [[ -z "${raw}" ]]; then
    echo "${default_value}"
  else
    echo "${raw}"
  fi
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"

  local escaped_value
  escaped_value="$(printf '%s' "${value}" | sed -e 's/[&|]/\\&/g')"

  if grep -q -E "^${key}=" "${file}"; then
    sed -i.bak -E "s|^${key}=.*$|${key}=\"${escaped_value}\"|" "${file}"
  else
    echo "${key}=\"${value}\"" >> "${file}"
  fi
}

cleanup_backup() {
  local file="$1"
  if [[ -f "${file}.bak" ]]; then
    rm -f "${file}.bak"
  fi
}

REPO_PATH="${REPO_ROOT}"
DEFAULT_WORKTREE_ID="$(basename "${REPO_PATH}")"
if [[ "${REPO_PATH}" =~ /worktrees/([^/]+)/ ]]; then
  DEFAULT_WORKTREE_ID="${BASH_REMATCH[1]}"
fi

WORKTREE_ID="${WORKTREE_ID_ARG:-${WORKTREE_ID:-${DEFAULT_WORKTREE_ID}}}"
WORKTREE_SLUG="$(to_slug "${WORKTREE_ID}")"
WORKTREE_HASH="$(printf '%s' "${WORKTREE_SLUG}" | cksum | awk '{print $1}')"

PORT_OFFSET=$((WORKTREE_HASH % 1000))
WEB_PORT=$((3000 + PORT_OFFSET))
WORKER_PORT=$((3030 + PORT_OFFSET))

POSTGRES_HOST_PORT="$(read_env_value "${ENV_FILE}" "POSTGRES_HOST_PORT" "5432")"
CLICKHOUSE_HTTP_PORT="$(read_env_value "${ENV_FILE}" "CLICKHOUSE_HTTP_PORT" "8123")"
CLICKHOUSE_NATIVE_PORT="$(read_env_value "${ENV_FILE}" "CLICKHOUSE_NATIVE_PORT" "9000")"
REDIS_HOST_PORT="$(read_env_value "${ENV_FILE}" "REDIS_HOST_PORT" "6379")"

REDIS_HOST="$(read_env_value "${ENV_FILE}" "REDIS_HOST" "127.0.0.1")"
REDIS_PORT="$(read_env_value "${ENV_FILE}" "REDIS_PORT" "${REDIS_HOST_PORT}")"
REDIS_AUTH="$(read_env_value "${ENV_FILE}" "REDIS_AUTH" "myredissecret")"
REDIS_USERNAME="$(read_env_value "${ENV_FILE}" "REDIS_USERNAME" "")"

BASE_DIRECT_URL="$(read_env_value "${ENV_FILE}" "DIRECT_URL" "postgresql://postgres:postgres@localhost:${POSTGRES_HOST_PORT}/postgres")"
BASE_DIRECT_URL_NO_QUERY="${BASE_DIRECT_URL%%\?*}"

BASE_TEST_DIRECT_URL="$(read_env_value "${TEST_ENV_FILE}" "DIRECT_URL" "postgresql://postgres:postgres@localhost:${POSTGRES_HOST_PORT}/langfuse_test")"
BASE_TEST_DIRECT_URL_NO_QUERY="${BASE_TEST_DIRECT_URL%%\?*}"

POSTGRES_SCHEMA_RAW="lf_${WORKTREE_SLUG}"
POSTGRES_SCHEMA="${POSTGRES_SCHEMA_RAW:0:55}"
POSTGRES_TEST_SCHEMA_RAW="${POSTGRES_SCHEMA}_test"
POSTGRES_TEST_SCHEMA="${POSTGRES_TEST_SCHEMA_RAW:0:63}"

CLICKHOUSE_DB_RAW="lf_${WORKTREE_SLUG}"
CLICKHOUSE_DB="${CLICKHOUSE_DB_RAW:0:63}"

REDIS_DB=$((2 + (WORKTREE_HASH % 14)))
TEST_REDIS_DB=$((2 + ((WORKTREE_HASH + 7) % 14)))

if [[ -n "${REDIS_USERNAME}" ]]; then
  if [[ -n "${REDIS_AUTH}" ]]; then
    REDIS_AUTH_SEGMENT="${REDIS_USERNAME}:${REDIS_AUTH}@"
  else
    REDIS_AUTH_SEGMENT="${REDIS_USERNAME}@"
  fi
else
  if [[ -n "${REDIS_AUTH}" ]]; then
    REDIS_AUTH_SEGMENT=":${REDIS_AUTH}@"
  else
    REDIS_AUTH_SEGMENT=""
  fi
fi

REDIS_CONNECTION_STRING="redis://${REDIS_AUTH_SEGMENT}${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}"
TEST_REDIS_CONNECTION_STRING="redis://${REDIS_AUTH_SEGMENT}${REDIS_HOST}:${REDIS_PORT}/${TEST_REDIS_DB}"

set_env_value "${ENV_FILE}" "WEB_PORT" "${WEB_PORT}"
set_env_value "${ENV_FILE}" "WORKER_PORT" "${WORKER_PORT}"
set_env_value "${ENV_FILE}" "WEB_HOST_PORT" "${WEB_PORT}"
set_env_value "${ENV_FILE}" "WORKER_HOST_PORT" "${WORKER_PORT}"
set_env_value "${ENV_FILE}" "NEXTAUTH_URL" "http://localhost:${WEB_PORT}"
set_env_value "${ENV_FILE}" "LANGFUSE_AI_FEATURES_HOST" "http://localhost:${WEB_PORT}"
set_env_value "${ENV_FILE}" "DIRECT_URL" "${BASE_DIRECT_URL_NO_QUERY}?schema=${POSTGRES_SCHEMA}"
set_env_value "${ENV_FILE}" "DATABASE_URL" "${BASE_DIRECT_URL_NO_QUERY}?schema=${POSTGRES_SCHEMA}"
set_env_value "${ENV_FILE}" "SHADOW_DATABASE_URL" "${BASE_DIRECT_URL_NO_QUERY}?schema=${POSTGRES_SCHEMA}_shadow"
set_env_value "${ENV_FILE}" "CLICKHOUSE_MIGRATION_URL" "clickhouse://localhost:${CLICKHOUSE_NATIVE_PORT}"
set_env_value "${ENV_FILE}" "CLICKHOUSE_URL" "http://localhost:${CLICKHOUSE_HTTP_PORT}"
set_env_value "${ENV_FILE}" "CLICKHOUSE_DB" "${CLICKHOUSE_DB}"
set_env_value "${ENV_FILE}" "REDIS_CONNECTION_STRING" "${REDIS_CONNECTION_STRING}"
set_env_value "${ENV_FILE}" "REDIS_KEY_PREFIX" "lf:${WORKTREE_SLUG}:"

set_env_value "${TEST_ENV_FILE}" "DIRECT_URL" "${BASE_TEST_DIRECT_URL_NO_QUERY}?schema=${POSTGRES_TEST_SCHEMA}"
set_env_value "${TEST_ENV_FILE}" "DATABASE_URL" "${BASE_TEST_DIRECT_URL_NO_QUERY}?schema=${POSTGRES_TEST_SCHEMA}"
set_env_value "${TEST_ENV_FILE}" "SHADOW_DATABASE_URL" "${BASE_TEST_DIRECT_URL_NO_QUERY}?schema=${POSTGRES_TEST_SCHEMA}_shadow"
set_env_value "${TEST_ENV_FILE}" "CLICKHOUSE_MIGRATION_URL" "clickhouse://localhost:${CLICKHOUSE_NATIVE_PORT}"
set_env_value "${TEST_ENV_FILE}" "CLICKHOUSE_URL" "http://localhost:${CLICKHOUSE_HTTP_PORT}"
set_env_value "${TEST_ENV_FILE}" "CLICKHOUSE_DB" "${CLICKHOUSE_DB}"
set_env_value "${TEST_ENV_FILE}" "REDIS_CONNECTION_STRING" "${TEST_REDIS_CONNECTION_STRING}"
set_env_value "${TEST_ENV_FILE}" "REDIS_KEY_PREFIX" "lf:${WORKTREE_SLUG}:test:"
set_env_value "${TEST_ENV_FILE}" "NEXTAUTH_URL" "http://localhost:${WEB_PORT}"

cleanup_backup "${ENV_FILE}"
cleanup_backup "${TEST_ENV_FILE}"

echo "Configured worktree environment:"
echo "- worktree id: ${WORKTREE_ID}"
echo "- web port: ${WEB_PORT}"
echo "- worker port: ${WORKER_PORT}"
echo "- postgres schema: ${POSTGRES_SCHEMA}"
echo "- clickhouse db: ${CLICKHOUSE_DB}"
echo "- redis db: ${REDIS_DB}"
echo ""
echo "Files updated:"
echo "- ${ENV_FILE}"
echo "- ${TEST_ENV_FILE}"

if [[ "${BOOTSTRAP_WORKTREE}" == "true" ]]; then
  echo ""
  echo "Bootstrapping dependencies, infrastructure, and migrations..."

  pnpm install

  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a

  CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
  CLICKHOUSE_DB="${CLICKHOUSE_DB:-default}"
  CLICKHOUSE_USER="${CLICKHOUSE_USER:-clickhouse}"
  CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-clickhouse}"

  pnpm run infra:dev:up

  ESCAPED_CLICKHOUSE_DB="${CLICKHOUSE_DB//\`/\`\`}"
  CREATE_DB_QUERY="CREATE DATABASE IF NOT EXISTS \`${ESCAPED_CLICKHOUSE_DB}\`"
  if [[ "${CLICKHOUSE_MIGRATION_SSL:-false}" == "true" ]]; then
    curl --fail --silent --show-error --insecure \
      --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
      "${CLICKHOUSE_URL}" \
      --data-binary "${CREATE_DB_QUERY}" > /dev/null
  else
    curl --fail --silent --show-error \
      --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" \
      "${CLICKHOUSE_URL}" \
      --data-binary "${CREATE_DB_QUERY}" > /dev/null
  fi

  pnpm --filter=shared run db:deploy
  pnpm --filter=shared run ch:up

  echo "Bootstrap complete."
fi
