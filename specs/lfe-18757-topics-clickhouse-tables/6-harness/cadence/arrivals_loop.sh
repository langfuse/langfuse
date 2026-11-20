#!/bin/sh
for spec in "cmlarge000000000000000001 1000000" "cmnoise000000000000000001 100000" "cmsmall000000000000000001 10000"; do set -- $spec
  d=2026-10-20; while [ "$d" != "2026-11-03" ]; do
    docker exec -i langfuse-clickhouse clickhouse-client --user clickhouse --password clickhouse --param_p=$1 --param_d=$d --param_cnt=$2 < 6-harness/cadence/arrivals_fill.sql || { echo "FAIL $1 $d"; exit 1; }
    d=$(date -j -v+1d -f %Y-%m-%d "$d" +%Y-%m-%d); done; done
echo ARRDONE
