#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

CASES=(
  "scores 26.5.5.8 fail"
  "scores 26.6.1.1193 fail"
  "scores 26.6.2.81 fail"
  "scores 26.7.1.1315 fail"
  "scores 26.7.2.59 pass"
  "patch-parts 25.12.11.4 fail"
  "patch-parts 26.2.19.43 fail"
  "patch-parts 26.3.17.110 fail"
  "patch-parts 26.4.1.1141 pass"
  "distributed 25.12.8.9 fail"
  "distributed 26.6.1.1193 fail"
  "distributed 26.6.2.81 pass"
  "distributed 26.7.1.1315 pass"
)

for matrix_case in "${CASES[@]}"; do
  read -r case_name clickhouse_tag expected_result <<<"${matrix_case}"
  echo "MATRIX case=${case_name} tag=${clickhouse_tag} expected=${expected_result}"
  "${SCRIPT_DIR}/run.sh" "${case_name}" "${clickhouse_tag}" "${expected_result}"
done

echo "MATRIX result=pass cases=${#CASES[@]}"
