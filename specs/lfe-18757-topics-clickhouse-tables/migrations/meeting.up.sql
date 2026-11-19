-- Option "meeting": the structure agreed in the 2026-11-18 design review, written as a canonical
-- migration template. Not applied anywhere; kept next to the proposal so both can be read and benchmarked.
-- Topics is still cloud-only and in closed beta, so both options drop and recreate the two tables without a backfill.
-- `topics` stays unchanged.

DROP TABLE IF EXISTS topic_assignments {CLICKHOUSE_CLUSTER_CLAUSE} SYNC;
DROP TABLE IF EXISTS topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE} SYNC;

-- Time stays right after the project; the primary key stops at facet_id; the trace or session id is replaced by its hash.
CREATE TABLE IF NOT EXISTS topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE}
(
    project_id String,
    facet_id String,
    facet_version UInt32,
    trace_id String DEFAULT '',
    session_id String DEFAULT '',
    CONSTRAINT topic_source_present CHECK notEmpty(trace_id) OR notEmpty(session_id),
    unit_hash UInt64 MATERIALIZED cityHash64(if(trace_id = '', session_id, trace_id)),
    rule_ids Array(String) DEFAULT [],
    environment LowCardinality(String),
    trace_name String DEFAULT '',
    CONSTRAINT topic_trace_name CHECK notEmpty(trace_id) OR empty(trace_name),
    unit_start_time DateTime64(3, 'UTC'),
    trigger_type LowCardinality(String),
    processing_state Enum8('complete' = 2, 'not_applicable' = 3, 'insufficient_input' = 4),
    summary String CODEC(ZSTD(3)),
    embedding Array(BFloat16),
    transcript_id String,
    transcript_version LowCardinality(String),
    summary_model LowCardinality(String),
    embedding_model LowCardinality(String),
    provided_usage_details Map(LowCardinality(String), UInt64),
    usage_details Map(LowCardinality(String), UInt64),
    provided_cost_details Map(LowCardinality(String), Decimal(18,12)),
    cost_details Map(LowCardinality(String), Decimal(18,12)),
    calculated_input_cost Decimal(18,12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, cost_details))),
    calculated_output_cost Decimal(18,12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, cost_details))),
    calculated_total_cost Decimal(18,12) MATERIALIZED arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0 OR positionCaseInsensitive(x.1, 'output') > 0, cost_details))),
    total_cost Decimal(18,12) ALIAS cost_details['total'],
    processed_at DateTime64(3, 'UTC'),
    metadata String CODEC(ZSTD(3)),
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.001) GRANULARITY 1
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}ReplacingMergeTree(processed_at)
PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, toStartOfMinute(unit_start_time), facet_id)
ORDER BY (project_id, toStartOfMinute(unit_start_time), facet_id, facet_version, unit_hash);

-- The review's pointer view instead of the projection: (project, facet, trace or session) -> unit_start_time,
-- partitioned by month so readers supply at least a month.
CREATE TABLE IF NOT EXISTS topic_facet_summary_pointers {CLICKHOUSE_CLUSTER_CLAUSE}
(
    project_id String,
    facet_id String,
    trace_id String,
    session_id String,
    facet_version UInt32,
    unit_start_time DateTime64(3, 'UTC')
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}ReplacingMergeTree
PARTITION BY toYYYYMM(unit_start_time)
ORDER BY (project_id, facet_id, trace_id, session_id, facet_version, unit_start_time);

CREATE MATERIALIZED VIEW IF NOT EXISTS topic_facet_summary_pointers_mv {CLICKHOUSE_CLUSTER_CLAUSE} TO topic_facet_summary_pointers AS
SELECT project_id, facet_id, trace_id, session_id, facet_version, unit_start_time
FROM topic_facet_summaries;

-- Facet before time (single-digit facets per project); run and hash after time; the primary key stops at time;
-- rule_id is a bloom filter rather than a key column.
CREATE TABLE IF NOT EXISTS topic_assignments {CLICKHOUSE_CLUSTER_CLAUSE}
(
    project_id String,
    facet_id String,
    rule_id String DEFAULT '',
    clustering_run_id String,
    facet_version UInt32,
    trace_id String DEFAULT '',
    session_id String DEFAULT '',
    CONSTRAINT topic_source_present CHECK notEmpty(trace_id) OR notEmpty(session_id),
    unit_hash UInt64 MATERIALIZED cityHash64(if(trace_id = '', session_id, trace_id)),
    environment LowCardinality(String),
    trace_name String DEFAULT '',
    CONSTRAINT topic_trace_name CHECK notEmpty(trace_id) OR empty(trace_name),
    unit_start_time DateTime64(3, 'UTC'),
    summary_processed_at DateTime64(3, 'UTC'),
    topic_id String DEFAULT '',
    topic_version_id String DEFAULT '',
    CONSTRAINT topic_identity_paired CHECK empty(topic_id) = empty(topic_version_id),
    distance Nullable(Float32),
    runner_up_distance Nullable(Float32),
    origin Enum8('initial' = 1, 'online' = 2),
    coordinates Array(Float32) DEFAULT [],
    assigned_at DateTime64(3, 'UTC'),
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_rule_id rule_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}ReplacingMergeTree(assigned_at)
PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, facet_id, toStartOfMinute(unit_start_time))
ORDER BY (project_id, facet_id, toStartOfMinute(unit_start_time), clustering_run_id, unit_hash);
