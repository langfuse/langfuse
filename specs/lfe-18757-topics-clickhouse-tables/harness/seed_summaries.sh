#!/bin/sh
BASE="project_id, facet_id, facet_version, trace_id, session_id, environment, trace_name, unit_start_time, trigger_type, processing_state, summary, embedding, transcript_id, transcript_version, summary_model, embedding_model, provided_usage_details, usage_details, provided_cost_details, cost_details, processed_at, metadata"
TEXT=$(echo "$BASE" | sed 's/ summary, embedding,/ summary,/')
GEN=$(cat "$(dirname "$0")/gen_sum.sql")
SET="SETTINGS max_threads = 6, max_insert_threads = 2, max_memory_usage = 5000000000, max_insert_block_size = 100000, min_insert_block_size_rows = 100000, min_insert_block_size_bytes = 0, max_block_size = 8192"
ins() { # table cols project day lo cnt
  docker exec -i langfuse-clickhouse clickhouse-client --user clickhouse --password clickhouse --param_p="$3" --param_d="$4" --param_lo="$5" --param_cnt="$6" \
    -q "INSERT INTO topics_schema_exp.$1 ($2) SELECT $2 FROM ($GEN) $SET" || { echo "FAIL $1 $3 $4 $5"; exit 1; }
}
d=${START:-2026-10-04}
while [ "$d" != "2026-11-03" ]; do
  for spec in "cmlarge000000000000000001 0 250000" "cmlarge000000000000000001 250000 250000" "cmlarge000000000000000001 500000 250000" "cmlarge000000000000000001 750000 250000" "cmnoise000000000000000001 0 100000" "cmsmall000000000000000001 0 10000"; do
    set -- $spec
    for t in ${TABLES:-sum_main sum_A sum_M}; do
      case $t in sum_main) c="$BASE";; sum_M) c="$BASE, rule_ids";; sum_A) c="$BASE, rule_ids";; esac
      a=$(date +%s); ins $t "$c" $1 $d $2 $3; echo "$t $d $1 $2 $(( $(date +%s) - a ))"
    done
  done
  d=$(date -j -v+1d -f %Y-%m-%d "$d" +%Y-%m-%d)
done
echo SEEDDONE
