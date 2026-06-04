# ClickHouse Query Tags

Langfuse sets structured ClickHouse `log_comment` values so `sysex.query_log`
can attribute query cost and performance by product surface, feature, storage
backend, workload, and project.

Use the shared repository wrappers
(`queryClickhouse`, `queryClickhouseStream`, `queryClickhouseWithProgress`,
`commandClickhouse`, `insertClickhouse`, `upsertClickhouse`) instead of constructing
`log_comment` by hand.

Callers should pass typed `ClickHouseQueryTags` via the wrapper `tags` option.
The wrappers normalize tags, merge request baggage, and set ClickHouse
`log_comment` internally.

## Dashboard Dimensions

Internal Grafana query-log dashboards should group by these low-cardinality
fields before falling back to query text or `operation_name`:

- `feature`
- `surface`
- `storage`
- `workload`
- `entity`
- `route`
- `service`
- `project_id`
- `tag_schema_version`

`storage` is the primary dimension for events-table migration cost analysis:

- `events`: queries against `events_core`, `events_full`, or the logical
  events table.
- `legacy`: queries against legacy ClickHouse tables such as `traces`,
  `observations`, `scores`, `dataset_run_items_rmt`, and `blob_storage_file_log`.
- `mixed`: intentional multi-storage queries.
- `unknown`: metadata queries or code paths where storage cannot be inferred.

Prefer `normalized_query_hash`, `read_rows`, `read_bytes`, `memory_usage`, and
CPU profile events to identify slow or expensive query shapes within a group.
Do not use raw IDs, filter values, query IDs, trace IDs, observation IDs, score
IDs, user IDs, or unnormalized dynamic routes in `log_comment`.

Example grouping query:

```sql
SELECT
  toStartOfHour(event_time_microseconds) AS time,
  simpleJSONExtractString(log_comment, 'feature') AS feature,
  simpleJSONExtractString(log_comment, 'surface') AS surface,
  simpleJSONExtractString(log_comment, 'storage') AS storage,
  simpleJSONExtractString(log_comment, 'workload') AS workload,
  simpleJSONExtractString(log_comment, 'project_id') AS project_id,
  sum(memory_usage) AS memory,
  sum(ProfileEvents['OSCPUVirtualTimeMicroseconds']) / 1000000 AS cpu_seconds
FROM sysex.query_log
WHERE type = 'QueryFinish'
  AND simpleJSONExtractString(log_comment, 'tag_schema_version') = '1'
GROUP BY time, feature, surface, storage, workload, project_id
ORDER BY time ASC;
```
