-- Billing ledger: one row per billable unit (observation, trace, score, topics
-- facet summary) each time it is ingested. A unit is billed once in a billing
-- window of ingested_at when its id appears there and not in the 24 hours
-- before the window starts (getBillableUnitCountsByProjectInWindow).
-- The ledger is append-only. It has no TTL, and deletes and data retention
-- never touch it, so the ids, sizes and timestamps of deleted or expired data
-- stay in it. It starts filling when this migration runs, and earlier usage is
-- not backfilled.
CREATE TABLE IF NOT EXISTS billable_events {CLICKHOUSE_CLUSTER_CLAUSE}
(
    ingested_at DateTime('UTC') DEFAULT now(),
    project_id String,
    event_type LowCardinality(String),
    event_id String,
    event_time DateTime64(3),
    event_bytes UInt64,
    environment LowCardinality(String) DEFAULT ''
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}MergeTree
PARTITION BY toMonday(ingested_at)
PRIMARY KEY (project_id, toStartOfFifteenMinutes(ingested_at))
ORDER BY (project_id, toStartOfFifteenMinutes(ingested_at), event_type, event_id);

-- A ledger created outside this migration may lack environment. The views
-- below write it, and a view that writes a missing column fails every insert
-- into its source table.
ALTER TABLE billable_events {CLICKHOUSE_CLUSTER_CLAUSE}
    ADD COLUMN IF NOT EXISTS environment LowCardinality(String) DEFAULT ''{CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};

-- The billing MVs only take rows created in the last 48 hours, so re-inserts
-- of historic rows that keep their created_at (backfills, updates) are not
-- new usage. Rows with is_deleted = 1 are tombstones, not usage.

-- MV: events_full -> billable_events (observations). A trace span that an
-- internal writer derived from a trace only counts as a trace. Span ids are
-- only unique within their trace, and ingestion API clients choose them, so
-- event_id is '<length(trace_id)>:<trace_id>:<span_id>'. The length prefix
-- keeps distinct (trace_id, span_id) pairs from concatenating to the same id.
CREATE MATERIALIZED VIEW IF NOT EXISTS billable_events_observations_mv {CLICKHOUSE_CLUSTER_CLAUSE}
TO billable_events AS
SELECT
    now() AS ingested_at,
    project_id,
    'observation' AS event_type,
    concat(toString(length(trace_id)), ':', trace_id, ':', span_id) AS event_id,
    start_time AS event_time,
    event_bytes,
    environment
FROM events_full
WHERE is_deleted = 0
  AND NOT (
    span_id = concat('t-', trace_id)
    AND (source LIKE '%-dual-write%' OR source LIKE '%-backfill')
  )
  AND created_at >= now() - INTERVAL 48 HOUR;

-- MV: events_full -> billable_events (traces), one row per trace per insert
-- block. event_bytes carries the derived trace span, which has no observation
-- row, so event_bytes over all rows adds up to events_full. The spans of a
-- trace share its environment, and any() picks one if they do not.
CREATE MATERIALIZED VIEW IF NOT EXISTS billable_events_traces_mv {CLICKHOUSE_CLUSTER_CLAUSE}
TO billable_events AS
SELECT
    now() AS ingested_at,
    project_id,
    'trace' AS event_type,
    trace_id AS event_id,
    min(start_time) AS event_time,
    sumIf(
        event_bytes,
        span_id = concat('t-', trace_id)
          AND (source LIKE '%-dual-write%' OR source LIKE '%-backfill')
    ) AS event_bytes,
    any(environment) AS environment
FROM events_full
WHERE is_deleted = 0
  AND trace_id != ''
  AND created_at >= now() - INTERVAL 48 HOUR
GROUP BY project_id, trace_id;

-- MV: scores -> billable_events.
CREATE MATERIALIZED VIEW IF NOT EXISTS billable_events_scores_mv {CLICKHOUSE_CLUSTER_CLAUSE}
TO billable_events AS
SELECT
    now() AS ingested_at,
    project_id,
    'score' AS event_type,
    id AS event_id,
    timestamp AS event_time,
    byteSize(*) AS event_bytes,
    environment
FROM scores
WHERE is_deleted = 0
  AND created_at >= now() - INTERVAL 48 HOUR;
