CREATE TABLE IF NOT EXISTS topics_schema_exp.c_sum_min 
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
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.0001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.0001) GRANULARITY 1
)
ENGINE = ReplacingMergeTree(processed_at)
PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, toStartOfMinute(unit_start_time), facet_id)
ORDER BY (project_id, toStartOfMinute(unit_start_time), facet_id, facet_version, unit_hash) SETTINGS max_bytes_to_merge_at_max_space_in_pool = 2147483648;
CREATE TABLE IF NOT EXISTS topics_schema_exp.c_sum_min_ptr 
(
    project_id String,
    facet_id String,
    trace_id String,
    session_id String,
    facet_version UInt32,
    unit_start_time DateTime64(3, 'UTC')
)
ENGINE = ReplacingMergeTree
PARTITION BY toYYYYMM(unit_start_time)
ORDER BY (project_id, facet_id, trace_id, session_id, facet_version, unit_start_time) SETTINGS max_bytes_to_merge_at_max_space_in_pool = 2147483648;
CREATE TABLE IF NOT EXISTS topics_schema_exp.c_sum_day 
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
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.0001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.0001) GRANULARITY 1
)
ENGINE = ReplacingMergeTree(processed_at)
PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, toDate(unit_start_time), facet_id, facet_version, unit_hash)
ORDER BY (project_id, toDate(unit_start_time), facet_id, facet_version, unit_hash) SETTINGS max_bytes_to_merge_at_max_space_in_pool = 2147483648;
CREATE TABLE IF NOT EXISTS topics_schema_exp.c_sum_hour 
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
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.0001) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.0001) GRANULARITY 1
)
ENGINE = ReplacingMergeTree(processed_at)
PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, toStartOfHour(unit_start_time), facet_id, facet_version, unit_hash)
ORDER BY (project_id, toStartOfHour(unit_start_time), facet_id, facet_version, unit_hash) SETTINGS max_bytes_to_merge_at_max_space_in_pool = 2147483648;
CREATE TABLE IF NOT EXISTS topics_schema_exp.c_asg_call 
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
    INDEX idx_session_id session_id TYPE bloom_filter(0.0001) GRANULARITY 1,
    INDEX idx_rule_id rule_id TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = ReplacingMergeTree(assigned_at)
PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, facet_id, toStartOfMinute(unit_start_time))
ORDER BY (project_id, facet_id, toStartOfMinute(unit_start_time), clustering_run_id, unit_hash) SETTINGS max_bytes_to_merge_at_max_space_in_pool = 2147483648;
CREATE TABLE IF NOT EXISTS topics_schema_exp.c_asg_prop 
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
ENGINE = ReplacingMergeTree(assigned_at)
PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, facet_id, clustering_run_id, topic_id, toStartOfHour(unit_start_time))
ORDER BY (project_id, facet_id, clustering_run_id, topic_id, toStartOfHour(unit_start_time), unit_hash) SETTINGS max_bytes_to_merge_at_max_space_in_pool = 2147483648;
CREATE TABLE IF NOT EXISTS topics_schema_exp.c_asg_prop_lookup 
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
ENGINE = ReplacingMergeTree(assigned_at)
PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, toStartOfMinute(unit_start_time), facet_id)
ORDER BY (project_id, toStartOfMinute(unit_start_time), facet_id, trace_id, session_id, rule_id, clustering_run_id) SETTINGS max_bytes_to_merge_at_max_space_in_pool = 2147483648;
CREATE TABLE IF NOT EXISTS topics_schema_exp.ingest_sum (project_id String, facet_id String, facet_version UInt32, trace_id String, session_id String, rule_ids Array(String),
  environment LowCardinality(String), trace_name String, unit_start_time DateTime64(3, 'UTC'), trigger_type LowCardinality(String),
  processing_state Enum8('complete' = 2, 'not_applicable' = 3, 'insufficient_input' = 4), summary String, embedding Array(BFloat16),
  transcript_id String, transcript_version LowCardinality(String), summary_model LowCardinality(String), embedding_model LowCardinality(String),
  provided_usage_details Map(LowCardinality(String), UInt64), usage_details Map(LowCardinality(String), UInt64),
  provided_cost_details Map(LowCardinality(String), Decimal(18, 12)), cost_details Map(LowCardinality(String), Decimal(18, 12)),
  processed_at DateTime64(3, 'UTC'), metadata String) ENGINE = Null;
CREATE TABLE IF NOT EXISTS topics_schema_exp.ingest_asg (project_id String, facet_id String, rule_id String, clustering_run_id String, facet_version UInt32, trace_id String, session_id String,
  environment LowCardinality(String), trace_name String, unit_start_time DateTime64(3, 'UTC'), summary_processed_at DateTime64(3, 'UTC'),
  topic_id String, topic_version_id String, distance Nullable(Float32), runner_up_distance Nullable(Float32),
  origin Enum8('initial' = 1, 'online' = 2), coordinates Array(Float32), assigned_at DateTime64(3, 'UTC')) ENGINE = Null;
CREATE MATERIALIZED VIEW IF NOT EXISTS topics_schema_exp.mv_c_sum_min TO topics_schema_exp.c_sum_min AS SELECT project_id, facet_id, facet_version, trace_id, session_id, rule_ids, environment, trace_name, unit_start_time, trigger_type, processing_state, summary, embedding, transcript_id, transcript_version, summary_model, embedding_model, provided_usage_details, usage_details, provided_cost_details, cost_details, processed_at, metadata FROM topics_schema_exp.ingest_sum;
CREATE MATERIALIZED VIEW IF NOT EXISTS topics_schema_exp.mv_c_sum_hour TO topics_schema_exp.c_sum_hour AS SELECT project_id, facet_id, facet_version, trace_id, session_id, rule_ids, environment, trace_name, unit_start_time, trigger_type, processing_state, summary, embedding, transcript_id, transcript_version, summary_model, embedding_model, provided_usage_details, usage_details, provided_cost_details, cost_details, processed_at, metadata FROM topics_schema_exp.ingest_sum;
CREATE MATERIALIZED VIEW IF NOT EXISTS topics_schema_exp.mv_c_sum_day TO topics_schema_exp.c_sum_day AS SELECT project_id, facet_id, facet_version, trace_id, session_id, rule_ids, environment, trace_name, unit_start_time, trigger_type, processing_state, summary, embedding, transcript_id, transcript_version, summary_model, embedding_model, provided_usage_details, usage_details, provided_cost_details, cost_details, processed_at, metadata FROM topics_schema_exp.ingest_sum;
CREATE MATERIALIZED VIEW IF NOT EXISTS topics_schema_exp.mv_c_sum_min_ptr TO topics_schema_exp.c_sum_min_ptr AS SELECT project_id, facet_id, trace_id, session_id, facet_version, unit_start_time FROM topics_schema_exp.c_sum_min;
CREATE MATERIALIZED VIEW IF NOT EXISTS topics_schema_exp.mv_c_asg_call TO topics_schema_exp.c_asg_call AS SELECT project_id, facet_id, rule_id, clustering_run_id, facet_version, trace_id, session_id, environment, trace_name, unit_start_time, summary_processed_at, topic_id, topic_version_id, distance, runner_up_distance, origin, coordinates, assigned_at FROM topics_schema_exp.ingest_asg;
CREATE MATERIALIZED VIEW IF NOT EXISTS topics_schema_exp.mv_c_asg_prop TO topics_schema_exp.c_asg_prop AS SELECT project_id, facet_id, rule_id, clustering_run_id, facet_version, trace_id, session_id, environment, trace_name, unit_start_time, summary_processed_at, topic_id, topic_version_id, distance, runner_up_distance, origin, coordinates, assigned_at FROM topics_schema_exp.ingest_asg;
CREATE MATERIALIZED VIEW IF NOT EXISTS topics_schema_exp.mv_c_asg_prop_lookup TO topics_schema_exp.c_asg_prop_lookup AS SELECT project_id, unit_start_time, facet_id, rule_id, trace_id, session_id, clustering_run_id, topic_id, topic_version_id, origin, assigned_at FROM topics_schema_exp.c_asg_prop;
