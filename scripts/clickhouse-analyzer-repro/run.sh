#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly CASE_NAME="${1:-}"
readonly CLICKHOUSE_TAG="${2:-}"
readonly EXPECTED_RESULT="${3:-either}"
readonly IMAGE="clickhouse/clickhouse-server:${CLICKHOUSE_TAG}"
readonly SINGLE_CONTAINER="ch-analyzer-repro-single"
readonly NODE1_CONTAINER="ch-analyzer-repro-node1"
readonly NODE2_CONTAINER="ch-analyzer-repro-node2"
readonly NETWORK="ch-analyzer-repro-network"

usage() {
  echo "Usage: $0 <scores|patch-parts|distributed> <clickhouse-tag> [fail|pass|either]"
}

if [[ -z "${CASE_NAME}" || -z "${CLICKHOUSE_TAG}" ]]; then
  usage
  exit 2
fi

if [[ "${EXPECTED_RESULT}" != "fail" && "${EXPECTED_RESULT}" != "pass" && "${EXPECTED_RESULT}" != "either" ]]; then
  usage
  exit 2
fi

wait_for_clickhouse() {
  local container="$1"
  local attempt

  for attempt in $(seq 1 45); do
    if docker exec "${container}" clickhouse-client --query "SELECT 1" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "ClickHouse did not become ready in ${container}" >&2
  return 1
}

remove_container() {
  local container="$1"
  docker rm -f "${container}" >/dev/null 2>&1 || true
}

cleanup_single() {
  remove_container "${SINGLE_CONTAINER}"
}

cleanup_distributed() {
  remove_container "${NODE1_CONTAINER}"
  remove_container "${NODE2_CONTAINER}"
  docker network rm "${NETWORK}" >/dev/null 2>&1 || true
}

start_node() {
  local container="$1"

  docker run -d \
    --name "${container}" \
    --hostname "${container}" \
    --ulimit nofile=262144:262144 \
    -e CLICKHOUSE_SKIP_USER_SETUP=1 \
    -v "${SCRIPT_DIR}:/repro:ro" \
    "${@:2}" \
    "${IMAGE}" >/dev/null
}

run_baseline() {
  local container="$1"
  local sql_file="$2"
  local signature="$3"
  local output
  local status
  local actual_result

  set +e
  output="$(docker exec "${container}" clickhouse-client --multiquery --queries-file "/repro/${sql_file}" 2>&1)"
  status=$?
  set -e

  echo "${output}"

  if [[ ${status} -eq 0 ]]; then
    actual_result="pass"
  else
    actual_result="fail"
    if [[ "${output}" != *"${signature}"* ]]; then
      echo "Baseline failed, but not with the expected signature: ${signature}" >&2
      return 1
    fi
  fi

  echo "BASELINE case=${CASE_NAME} version=${ACTUAL_VERSION} result=${actual_result}"

  if [[ "${EXPECTED_RESULT}" != "either" && "${actual_result}" != "${EXPECTED_RESULT}" ]]; then
    echo "Expected ${EXPECTED_RESULT}, got ${actual_result}" >&2
    return 1
  fi
}

run_single_case() {
  local setup_file="$1"
  local repro_file="$2"
  local mitigations_file="$3"
  local signature="$4"

  cleanup_single
  trap cleanup_single EXIT

  start_node "${SINGLE_CONTAINER}"
  wait_for_clickhouse "${SINGLE_CONTAINER}"
  ACTUAL_VERSION="$(docker exec "${SINGLE_CONTAINER}" clickhouse-client --query "SELECT version()")"
  readonly ACTUAL_VERSION

  docker exec "${SINGLE_CONTAINER}" clickhouse-client --multiquery --queries-file "/repro/${setup_file}"
  run_baseline "${SINGLE_CONTAINER}" "${repro_file}" "${signature}"
  docker exec "${SINGLE_CONTAINER}" clickhouse-client --multiquery --queries-file "/repro/${mitigations_file}"
  echo "MITIGATIONS case=${CASE_NAME} version=${ACTUAL_VERSION} result=pass"
}

run_distributed_case() {
  cleanup_distributed
  trap cleanup_distributed EXIT

  docker network create "${NETWORK}" >/dev/null
  start_node "${NODE1_CONTAINER}" --network "${NETWORK}" -v "${SCRIPT_DIR}/distributed-cluster.xml:/etc/clickhouse-server/config.d/repro-cluster.xml:ro"
  start_node "${NODE2_CONTAINER}" --network "${NETWORK}" -v "${SCRIPT_DIR}/distributed-cluster.xml:/etc/clickhouse-server/config.d/repro-cluster.xml:ro"
  wait_for_clickhouse "${NODE1_CONTAINER}"
  wait_for_clickhouse "${NODE2_CONTAINER}"
  ACTUAL_VERSION="$(docker exec "${NODE1_CONTAINER}" clickhouse-client --query "SELECT version()")"
  readonly ACTUAL_VERSION

  docker exec "${NODE2_CONTAINER}" clickhouse-client --multiquery --queries-file /repro/distributed-node2-setup.sql
  docker exec "${NODE1_CONTAINER}" clickhouse-client --multiquery --queries-file /repro/distributed-node1-setup.sql
  run_baseline "${NODE1_CONTAINER}" distributed-repro.sql "Unsupported types to CAST AS Map"
  docker exec "${NODE1_CONTAINER}" clickhouse-client --multiquery --queries-file /repro/distributed-mitigations.sql
  echo "MITIGATIONS case=${CASE_NAME} version=${ACTUAL_VERSION} result=pass"
}

case "${CASE_NAME}" in
  scores)
    run_single_case scores-setup.sql scores-repro.sql scores-mitigations.sql NOT_FOUND_COLUMN_IN_BLOCK
    ;;
  patch-parts)
    run_single_case patch-parts-setup.sql patch-parts-repro.sql patch-parts-mitigations.sql _block_number
    ;;
  distributed)
    run_distributed_case
    ;;
  *)
    usage
    exit 2
    ;;
esac
