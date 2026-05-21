-- Staging table for the dual-write pipeline that populates events_full.
-- Ingestion writes every observation (and trace-as-synthetic-observation) here
-- with an s3_first_seen_timestamp; the periodic event-propagation job in the
-- worker reads completed 3-minute partitions, joins them with `traces`, and
-- inserts the result into `events_full`.
--
-- Partitions are automatically expired after 48 hours via TTL. The 48h window
-- (vs. the 12h used internally for Langfuse Cloud) gives self-hosters a
-- multi-day grace period to recover the propagation job after an incident
-- without losing staging data. `ttl_only_drop_parts = 1` ensures only complete
-- partitions are dropped, never individual rows.
--
-- See LFE-7122 for the original design notes.
CREATE TABLE IF NOT EXISTS observations_batch_staging
(
    id String,
    trace_id String,
    project_id String,
    type LowCardinality(String),
    parent_observation_id Nullable(String),
    start_time DateTime64(3),
    end_time Nullable(DateTime64(3)),
    name String,
    metadata Map(LowCardinality(String), String),
    level LowCardinality(String),
    status_message Nullable(String),
    version Nullable(String),
    input Nullable(String) CODEC(ZSTD(3)),
    output Nullable(String) CODEC(ZSTD(3)),
    provided_model_name Nullable(String),
    internal_model_id Nullable(String),
    model_parameters Nullable(String),
    provided_usage_details Map(LowCardinality(String), UInt64),
    usage_details Map(LowCardinality(String), UInt64),
    provided_cost_details Map(LowCardinality(String), Decimal64(12)),
    cost_details Map(LowCardinality(String), Decimal64(12)),
    total_cost Nullable(Decimal64(12)),
    usage_pricing_tier_id Nullable(String),
    usage_pricing_tier_name Nullable(String),
    tool_definitions Map(String, String),
    tool_calls Array(String),
    tool_call_names Array(String),
    completion_start_time Nullable(DateTime64(3)),
    prompt_id Nullable(String),
    prompt_name Nullable(String),
    prompt_version Nullable(UInt16),
    created_at DateTime64(3) DEFAULT now(),
    updated_at DateTime64(3) DEFAULT now(),
    event_ts DateTime64(3),
    is_deleted UInt8,
    s3_first_seen_timestamp DateTime64(3),
    environment LowCardinality(String) DEFAULT 'default'
)
ENGINE = ReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toStartOfInterval(s3_first_seen_timestamp, INTERVAL 3 MINUTE)
PRIMARY KEY (project_id, toDate(s3_first_seen_timestamp))
ORDER BY (
    project_id,
    toDate(s3_first_seen_timestamp),
    trace_id,
    id
)
TTL s3_first_seen_timestamp + INTERVAL 48 HOUR
SETTINGS ttl_only_drop_parts = 1;
