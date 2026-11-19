#!/bin/sh
AB="rule_id, project_id, facet_id, facet_version, trace_id, session_id, environment, trace_name, unit_start_time, summary_processed_at, clustering_run_id, topic_id, topic_version_id, distance, runner_up_distance, origin, coordinates, assigned_at"
M=$(echo "$AB" | sed 's/^rule_id, //')
GEN=$(cat "$(dirname "$0")/gen_asg.sql")
SET="SETTINGS max_threads = 6, max_insert_threads = 2, max_memory_usage = 6000000000, max_insert_block_size = 200000, min_insert_block_size_rows = 200000, min_insert_block_size_bytes = 0"
d=${START:-2026-10-04}; END=${END:-2026-11-03}
while [ "$d" != "$END" ]; do
  for p in cmlarge000000000000000001 cmnoise000000000000000001 cmsmall000000000000000001; do
    for t in ${TABLES:-asg_main asg_AB asg_M}; do
      c="$AB"; [ $t = asg_main ] && c="$M"
      a=$(date +%s)
      docker exec -i langfuse-clickhouse clickhouse-client --user clickhouse --password clickhouse --param_p=$p --param_d=$d -q "INSERT INTO topics_schema_exp.$t ($c) SELECT $c FROM ($GEN) $SET" || { echo "FAIL $t $p $d"; exit 1; }
      echo "$t $d $p $(( $(date +%s) - a ))"
    done
  done
  d=$(date -j -v+1d -f %Y-%m-%d "$d" +%Y-%m-%d)
done
echo ASGDONE
