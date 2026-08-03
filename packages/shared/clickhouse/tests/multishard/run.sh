#!/usr/bin/env bash

set -euo pipefail

FIXTURE_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${FIXTURE_DIRECTORY}/docker-compose.yml"
MIGRATION_FILE="${FIXTURE_DIRECTORY}/../../migrations/sharded/0001_sharded_baseline.up.sql"

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

query() {
  compose exec -T ch-2a clickhouse-client \
    --user clickhouse \
    --password clickhouse \
    --multiquery \
    "$@"
}

cleanup() {
  compose down --volumes --remove-orphans
}

trap cleanup EXIT
cleanup
compose up --detach --wait

until query --query "SELECT count() FROM system.zookeeper WHERE path = '/'" >/dev/null 2>&1; do
  sleep 1
done

if command -v migrate >/dev/null 2>&1; then
  (
    cd "${FIXTURE_DIRECTORY}/../../.."
    CLICKHOUSE_URL="http://127.0.0.1:8123" \
    CLICKHOUSE_MIGRATION_URL="clickhouse://127.0.0.1:${CLICKHOUSE_MULTISHARD_NATIVE_PORT:-39900}" \
    CLICKHOUSE_USER="clickhouse" \
    CLICKHOUSE_PASSWORD="clickhouse" \
    CLICKHOUSE_DB="default" \
    CLICKHOUSE_CLUSTER_ENABLED="true" \
    CLICKHOUSE_SHARDING_ENABLED="true" \
    CLICKHOUSE_CLUSTER_NAME="default" \
    bash clickhouse/scripts/up.sh
  )
else
  query < "${MIGRATION_FILE}" >/dev/null
fi

if query < "${MIGRATION_FILE}" >/dev/null 2>&1; then
  echo "Sharded migration unexpectedly accepted a non-empty schema" >&2
  exit 1
fi

TOPOLOGY="$(query --query "SELECT uniqExact(shard_num), count(), min(internal_replication) FROM system.clusters WHERE cluster = 'default' FORMAT TSVRaw")"
test "${TOPOLOGY}" = $'2\t4\t1'

CONTRACT_ROWS="$(query --query "SELECT count() FROM clusterAllReplicas('default', system.tables) WHERE database = currentDatabase() AND name IN ('traces', 'traces_local', 'observations', 'observations_local', 'scores', 'scores_local', 'events_full', 'events_full_local') AND comment = 'langfuse_sharding_schema=1,langfuse_routing=1' FORMAT TSVRaw")"
test "${CONTRACT_ROWS}" = "32"

REPLICA_PATHS="$(query --query "SELECT count() FROM clusterAllReplicas('default', system.replicas) WHERE database = currentDatabase() AND table IN ('traces_local', 'observations_local', 'scores_local', 'events_full_local') AND position(zookeeper_path, '/clickhouse/tables/') = 1 FORMAT TSVRaw")"
test "${REPLICA_PATHS}" = "16"

query --query "INSERT INTO traces (id, timestamp, name, metadata, project_id, public, bookmarked, tags, event_ts, is_deleted) VALUES ('trace-colocate', now64(3), 'fixture', map(), 'project-colocate', false, false, [], now64(3), 0)"
query --query "INSERT INTO observations (id, trace_id, project_id, type, start_time, name, metadata, level, provided_usage_details, usage_details, provided_cost_details, cost_details, event_ts, is_deleted) VALUES ('observation-colocate', 'trace-colocate', 'project-colocate', 'SPAN', now64(3), 'fixture', map(), 'DEFAULT', map(), map(), map(), map(), now64(3), 0)"
query --query "INSERT INTO scores (id, timestamp, project_id, trace_id, name, value, source, metadata, data_type, event_ts, is_deleted) VALUES ('score-colocate', now64(3), 'project-colocate', 'trace-colocate', 'fixture', 1, 'API', map(), 'NUMERIC', now64(3), 0)"
query --query "INSERT INTO observations_batch_staging (id, trace_id, project_id, type, start_time, name, metadata, level, provided_usage_details, usage_details, provided_cost_details, cost_details, event_ts, is_deleted, s3_first_seen_timestamp) VALUES ('staging-colocate', 'trace-colocate', 'project-colocate', 'SPAN', now64(3), 'fixture', map(), 'DEFAULT', map(), map(), map(), map(), now64(3), 0, now64(3))"
query --query "INSERT INTO dataset_run_items_rmt (id, project_id, dataset_run_id, dataset_item_id, dataset_id, trace_id, created_at, updated_at, dataset_run_name, dataset_run_metadata, dataset_run_created_at, dataset_item_metadata, event_ts, is_deleted) VALUES ('dri-colocate', 'project-colocate', 'run', 'item', 'dataset', 'trace-colocate', now64(3), now64(3), 'fixture', map(), now64(3), map(), now64(3), 0)"
query --query "INSERT INTO events_full (project_id, trace_id, span_id, parent_span_id, start_time, name, type, event_ts, is_deleted) VALUES ('project-colocate', 'trace-colocate', 'event-colocate', '', now64(6), 'fixture', 'SPAN', now64(6), 0)"
query --query "INSERT INTO blob_storage_file_log (id, project_id, entity_type, entity_id, event_id, bucket_name, bucket_path, event_ts, is_deleted) VALUES ('blob-colocate', 'project-colocate', 'TRACE', 'trace-colocate', 'event', 'bucket', 'path', now64(3), 0)"

COLOCATED_SHARDS="$(for table in traces observations scores observations_batch_staging dataset_run_items_rmt events_full; do query --query "SELECT DISTINCT _shard_num FROM ${table} WHERE project_id = 'project-colocate' FORMAT TSVRaw"; done | sort -u)"
test "$(printf '%s\n' "${COLOCATED_SHARDS}" | wc -l | tr -d ' ')" = "1"

query --query "INSERT INTO traces (id, timestamp, name, metadata, project_id, public, bookmarked, tags, event_ts, is_deleted) SELECT concat('trace-', toString(number)), now64(3), 'fixture', map(), concat('project-', toString(number % 7)), false, false, [], now64(3), 0 FROM numbers(100)"

SHARD_COUNTS="$(query --query "SELECT _shard_num, count() FROM traces GROUP BY _shard_num ORDER BY _shard_num FORMAT TSVRaw")"
test "$(printf '%s\n' "${SHARD_COUNTS}" | wc -l | tr -d ' ')" = "2"

query --query "INSERT INTO events_full (project_id, trace_id, span_id, parent_span_id, start_time, name, type, event_ts, is_deleted) VALUES ('project-event', 'trace-event', 'span-event', '', now64(6), 'fixture', 'SPAN', now64(6), 0)"
query --query "SYSTEM FLUSH DISTRIBUTED events_full"
EVENT_CORE_COUNT="$(query --query "SELECT count() FROM events_core WHERE project_id = 'project-event' AND trace_id = 'trace-event' FORMAT TSVRaw")"
test "${EVENT_CORE_COUNT}" = "1"

compose stop ch-1a
query --query "INSERT INTO traces (id, timestamp, name, metadata, project_id, public, bookmarked, tags, event_ts, is_deleted) SELECT concat('failover-', toString(number)), now64(3), 'fixture', map(), concat('project-', toString(number % 7)), false, false, [], now64(3), 0 FROM numbers(100, 100)"
query --query "SYSTEM FLUSH DISTRIBUTED traces"
TOTAL_DURING_FAILOVER="$(query --query "SELECT count() FROM traces FORMAT TSVRaw")"
test "${TOTAL_DURING_FAILOVER}" = "201"

compose start ch-1a
until compose exec -T ch-1a clickhouse-client --user clickhouse --password clickhouse --query "SELECT 1" >/dev/null 2>&1; do
  sleep 1
done
compose exec -T ch-1a clickhouse-client --user clickhouse --password clickhouse --query "SYSTEM SYNC REPLICA traces_local"

count_local() {
  compose exec -T "$1" clickhouse-client --user clickhouse --password clickhouse --query "SELECT count() FROM traces_local FORMAT TSVRaw"
}
SHARD_1A_COUNT="$(count_local ch-1a)"
SHARD_1B_COUNT="$(count_local ch-1b)"
SHARD_2A_COUNT="$(count_local ch-2a)"
SHARD_2B_COUNT="$(count_local ch-2b)"
echo "Replica counts: shard1=${SHARD_1A_COUNT}/${SHARD_1B_COUNT}, shard2=${SHARD_2A_COUNT}/${SHARD_2B_COUNT}"
test "${SHARD_1A_COUNT}" = "${SHARD_1B_COUNT}"
test "${SHARD_2A_COUNT}" = "${SHARD_2B_COUNT}"

PART_NODES="$(query --query "SELECT uniqExact(hostName()) FROM clusterAllReplicas('default', 'system.parts') WHERE database = currentDatabase() AND table = 'traces_local' AND active = 1 FORMAT TSVRaw")"
SHARD_PATHS="$(query --query "SELECT uniqExact(zookeeper_path) FROM clusterAllReplicas('default', 'system.replicas') WHERE database = currentDatabase() AND table = 'traces_local' FORMAT TSVRaw")"
echo "Active part nodes=${PART_NODES}, replicated shard paths=${SHARD_PATHS}"
test "${PART_NODES}" = "4"
test "${SHARD_PATHS}" = "2"

query --query "DELETE FROM traces_local ON CLUSTER default WHERE project_id = 'project-0' SETTINGS mutations_sync = 2" >/dev/null
DELETED_PROJECT_ROWS="$(query --query "SELECT count() FROM traces WHERE project_id = 'project-0' FORMAT TSVRaw")"
echo "Rows after cluster delete: ${DELETED_PROJECT_ROWS}"
test "${DELETED_PROJECT_ROWS}" = "0"

for table in traces observations scores observations_batch_staging dataset_run_items_rmt events_full events_core blob_storage_file_log; do
  query --query "DELETE FROM ${table}_local ON CLUSTER default WHERE project_id = 'project-colocate' SETTINGS mutations_sync = 2" >/dev/null
done
COLOCATED_ROWS_AFTER_DELETE="$(query --query "SELECT (SELECT count() FROM traces WHERE project_id = 'project-colocate') + (SELECT count() FROM observations WHERE project_id = 'project-colocate') + (SELECT count() FROM scores WHERE project_id = 'project-colocate') + (SELECT count() FROM observations_batch_staging WHERE project_id = 'project-colocate') + (SELECT count() FROM dataset_run_items_rmt WHERE project_id = 'project-colocate') + (SELECT count() FROM events_full WHERE project_id = 'project-colocate') + (SELECT count() FROM events_core WHERE project_id = 'project-colocate') + (SELECT count() FROM blob_storage_file_log WHERE project_id = 'project-colocate') FORMAT TSVRaw")"
test "${COLOCATED_ROWS_AFTER_DELETE}" = "0"

compose stop ch-1a ch-1b
if query --query "SELECT count() FROM traces" >/dev/null 2>&1; then
  echo "Distributed read unexpectedly returned partial results with a whole shard unavailable" >&2
  exit 1
fi
compose start ch-1a ch-1b
for service in ch-1a ch-1b; do
  until compose exec -T "${service}" clickhouse-client --user clickhouse --password clickhouse --query "SELECT 1" >/dev/null 2>&1; do
    sleep 1
  done
done

echo "Multi-shard integration: schema guard, 2 shards, 4 replicas, routing, local MV, deletion, replica failover, and shard fail-closed passed"
