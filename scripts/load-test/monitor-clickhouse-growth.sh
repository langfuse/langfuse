#!/usr/bin/env bash
#
# Monitors ClickHouse (Langfuse) storage growth during/after a load test,
# and computes the GB / 1000 traces ratio to detect non-proportional
# growth.
#
# Usage:
#   ./monitor-clickhouse-growth.sh <namespace> <clickhouse-pod-name> <interval_sec> <output.csv>
#
# Example:
#   ./monitor-clickhouse-growth.sh langfuse langfuse-clickhouse-0 300 growth.csv
#
# Requirements: kubectl exec access to the ClickHouse pod, `traces` table
# reachable via clickhouse-client locally inside the pod.

set -euo pipefail

NAMESPACE="${1:?namespace required}"
POD="${2:?clickhouse pod name required}"
INTERVAL="${3:-300}"
OUTFILE="${4:-clickhouse-growth.csv}"

echo "timestamp,total_bytes_on_disk,total_bytes_gb,trace_count,gb_per_1000_traces,pvc_used_kb" > "${OUTFILE}"

ch_query() {
  kubectl exec -n "${NAMESPACE}" "${POD}" -c clickhouse -- \
    clickhouse-client --query "$1" 2>/dev/null
}

while true; do
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Total size of active parts (across all Langfuse tables)
  bytes=$(ch_query "SELECT sum(bytes_on_disk) FROM system.parts WHERE active" || echo "0")
  bytes=${bytes:-0}
  gb=$(awk -v b="${bytes}" 'BEGIN { printf "%.4f", b/1024/1024/1024 }')

  # Number of traces actually stored (adjust table/DB name if needed)
  trace_count=$(ch_query "SELECT count() FROM traces" || echo "0")
  trace_count=${trace_count:-0}

  if [ "${trace_count}" -gt 0 ]; then
    gb_per_1k=$(awk -v g="${gb}" -v t="${trace_count}" 'BEGIN { printf "%.6f", (g/t)*1000 }')
  else
    gb_per_1k="NA"
  fi

  # Size used on the mounted volume (EFS/PVC) at the OS level, to compare
  # against the ClickHouse logical view (system.parts does not include
  # some ancillary files: WAL, tmp, leftover system logs, etc.)
  pvc_used_kb=$(kubectl exec -n "${NAMESPACE}" "${POD}" -c clickhouse -- \
    sh -c "du -sk /var/lib/clickhouse 2>/dev/null | cut -f1" || echo "0")

  echo "${ts},${bytes},${gb},${trace_count},${gb_per_1k},${pvc_used_kb}" | tee -a "${OUTFILE}"

  sleep "${INTERVAL}"
done
