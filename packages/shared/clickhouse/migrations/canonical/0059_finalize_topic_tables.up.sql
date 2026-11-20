-- Re-keys the Topics summaries and assignments and recreates topics (tags renamed to labels), all empty. The old tables are kept as *_old (not read or written) and dropped later.
RENAME TABLE topic_facet_summaries TO topic_facet_summaries_old, topic_assignments TO topic_assignments_old, topics TO topics_old {CLICKHOUSE_CLUSTER_CLAUSE};

CREATE TABLE IF NOT EXISTS topics {CLICKHOUSE_CLUSTER_CLAUSE}
(
    project_id String,
    id String,
    stable_id String,
    created_by_run_id String,
    created_at DateTime64(3, 'UTC'),
    name String,
    description String CODEC(ZSTD(3)),
    centroid Array(Float64),
    radius Float64,
    labels Array(String) DEFAULT [],
    representative_summaries Array(Tuple(facet_id String, facet_version UInt32, trace_id String, session_id String)),
    metadata String CODEC(ZSTD(3))
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(created_at)
ORDER BY (project_id, toDate(created_at), id)
SETTINGS enable_block_number_column = 1, enable_block_offset_column = 1;

CREATE TABLE IF NOT EXISTS topic_facet_summaries {CLICKHOUSE_CLUSTER_CLAUSE}
(
    project_id String,
    facet_id String,
    facet_version UInt32,
    trace_id String DEFAULT '',
    session_id String DEFAULT '',
    CONSTRAINT topic_source_present CHECK notEmpty(trace_id) OR notEmpty(session_id),
    unit_hash UInt64 MATERIALIZED cityHash64(if(trace_id = '', session_id, trace_id)),
    unit_type Enum8('trace' = 1, 'session' = 2) MATERIALIZED if(trace_id = '', 'session', 'trace'),
    rule_ids Array(String) DEFAULT [],
    environment LowCardinality(String),
    trace_name String DEFAULT '',
    CONSTRAINT topic_trace_name CHECK notEmpty(trace_id) OR empty(trace_name),
    unit_start_time DateTime64(3, 'UTC'),
    trigger_type LowCardinality(String),
    execution_id String DEFAULT '',
    processing_state Enum8('complete' = 2, 'not_applicable' = 3, 'insufficient_input' = 4),
    summary String CODEC(ZSTD(3)),
    embedding Array(BFloat16),
    transcript_id String,
    transcript_version LowCardinality(String),
    transcript_bytes UInt32,
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
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.0001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.0001) GRANULARITY 1
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}ReplacingMergeTree(processed_at)
PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, toStartOfHour(unit_start_time), facet_id, facet_version, unit_type, unit_hash)
ORDER BY (project_id, toStartOfHour(unit_start_time), facet_id, facet_version, unit_type, unit_hash)
SETTINGS enable_block_number_column = 1, enable_block_offset_column = 1;

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
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.0001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.0001) GRANULARITY 1
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}ReplacingMergeTree(assigned_at)
PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, facet_id, clustering_run_id, topic_id, toStartOfHour(unit_start_time))
ORDER BY (project_id, facet_id, clustering_run_id, topic_id, toStartOfHour(unit_start_time), unit_hash, origin)
SETTINGS enable_block_number_column = 1, enable_block_offset_column = 1;

-- origin ends the sort key so an online row does not replace the unit's initial membership.

-- Narrow time-ordered copy of assignments for "which topic does this trace have".
CREATE TABLE IF NOT EXISTS topic_assignments_by_trace {CLICKHOUSE_CLUSTER_CLAUSE}
(
    project_id String,
    unit_start_time DateTime64(3, 'UTC'),
    facet_id String,
    rule_id String,
    trace_id String,
    session_id String,
    clustering_run_id String,
    topic_id String,
    topic_version_id String,
    origin Enum8('initial' = 1, 'online' = 2),
    assigned_at DateTime64(3, 'UTC'),
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.0001) GRANULARITY 1
)
ENGINE = {CLICKHOUSE_REPLICATION_PREFIX}ReplacingMergeTree(assigned_at)
PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, toStartOfMinute(unit_start_time), facet_id)
ORDER BY (project_id, toStartOfMinute(unit_start_time), facet_id, trace_id, session_id, rule_id, clustering_run_id)
SETTINGS enable_block_number_column = 1, enable_block_offset_column = 1;

CREATE MATERIALIZED VIEW IF NOT EXISTS topic_assignments_by_trace_mv {CLICKHOUSE_CLUSTER_CLAUSE} TO topic_assignments_by_trace AS
SELECT project_id, unit_start_time, facet_id, rule_id, trace_id, session_id, clustering_run_id, topic_id, topic_version_id, origin, assigned_at
FROM topic_assignments;
