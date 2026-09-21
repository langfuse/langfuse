CREATE TABLE IF NOT EXISTS topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE}
(
    project_id String,
    facet_id String,
    facet_version_id String,
    facet_version UInt32,
    trace_id String DEFAULT '',
    session_id String DEFAULT '',
    CONSTRAINT topic_source_xor CHECK notEmpty(trace_id) != notEmpty(session_id),
    unit_timestamp DateTime64(3, 'UTC'),
    id String,
    revision UInt64,
    execution_id String,
    trigger_type LowCardinality(String) DEFAULT 'manual_poc',
    result_version UInt8,
    processing_state Enum8('complete' = 2, 'not_applicable' = 3, 'insufficient_input' = 4),
    summary String CODEC(ZSTD(3)),
    embedding Array(Float32),
    input_hash String,
    invocation_hash String,
    summary_model LowCardinality(String),
    embedding_model LowCardinality(String),
    input_tokens UInt32,
    output_tokens UInt32,
    embedding_tokens UInt32,
    summary_cost_usd Decimal(18, 12),
    embedding_cost_usd Decimal(18, 12),
    processed_at DateTime64(3, 'UTC'),
    metadata String CODEC(ZSTD(3))
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}ReplacingMergeTree(result_version)
PARTITION BY toYYYYMM(unit_timestamp)
PRIMARY KEY (project_id, facet_id, toDate(unit_timestamp))
ORDER BY (project_id, facet_id, toDate(unit_timestamp), trace_id, session_id, facet_version_id, revision, id);

CREATE TABLE IF NOT EXISTS topic_assignments {CLICKHOUSE_CLUSTER_CLAUSE}
(
    project_id String,
    facet_id String,
    facet_version_id String,
    facet_version UInt32,
    trace_id String DEFAULT '',
    session_id String DEFAULT '',
    CONSTRAINT topic_source_xor CHECK notEmpty(trace_id) != notEmpty(session_id),
    unit_timestamp DateTime64(3, 'UTC'),
    id String,
    facet_summary_id String,
    execution_id String,
    summary_revision UInt64,
    clustering_run_id String,
    run_sequence UInt64,
    topic_id String,
    topic_version_id String,
    outcome Enum8('assigned' = 1, 'outlier' = 2, 'not_applicable' = 3, 'insufficient_input' = 4, 'awaiting_topics' = 5),
    distance Nullable(Float32),
    runner_up_distance Nullable(Float32),
    rejection_reason LowCardinality(String),
    origin Enum8('initial' = 1, 'online' = 2, 'backfill' = 3),
    coordinates Array(Float32) DEFAULT [],
    assigned_at DateTime64(3, 'UTC'),
    result_version UInt8 DEFAULT 1
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}ReplacingMergeTree(result_version)
PARTITION BY toYYYYMM(unit_timestamp)
PRIMARY KEY (project_id, facet_id, toDate(unit_timestamp))
ORDER BY (project_id, facet_id, toDate(unit_timestamp), trace_id, session_id, facet_summary_id, clustering_run_id, id);
