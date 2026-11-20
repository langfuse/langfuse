-- Benchmark tables in the scratch database topics_schema_exp: main layout (sum_main, asg_main) and the proposal
-- (sum_A, asg_AB, asg_AB_by_time). The review-call version is in ddl_review_call.sql.
CREATE DATABASE IF NOT EXISTS topics_schema_exp;
-- 1,066 real summaries from local test projects; the generator samples summary text from them
CREATE TABLE IF NOT EXISTS topics_schema_exp.pool (summary String) ENGINE = MergeTree ORDER BY tuple();
-- per (project, facet, rule) daily complete-summary counts; gen_asg.sql uses them to size each night's 100k sample.
-- Fill after seeding summaries:
-- INSERT INTO topics_schema_exp.map_counts SELECT project_id, facet_id, rule, count() / 30 FROM topics_schema_exp.sum_A ARRAY JOIN rule_ids AS rule WHERE processing_state = 'complete' GROUP BY ALL;
CREATE TABLE IF NOT EXISTS topics_schema_exp.map_counts (project_id String, facet_id String, rule String, per_day Float64) ENGINE = MergeTree ORDER BY (project_id, facet_id, rule);
CREATE TABLE topics_schema_exp.sum_main (
  project_id String, facet_id String, facet_version UInt32, trace_id String DEFAULT '', session_id String DEFAULT '',
  environment LowCardinality(String), trace_name String DEFAULT '', unit_start_time DateTime64(3, 'UTC'),
  trigger_type LowCardinality(String) DEFAULT 'manual_poc', processing_state Enum8('complete' = 2, 'not_applicable' = 3, 'insufficient_input' = 4),
  summary String CODEC(ZSTD(3)), embedding Array(BFloat16), transcript_id String DEFAULT 'poc', transcript_version LowCardinality(String) DEFAULT 'poc',
  summary_model LowCardinality(String), embedding_model LowCardinality(String),
  provided_usage_details Map(LowCardinality(String), UInt64), usage_details Map(LowCardinality(String), UInt64),
  provided_cost_details Map(LowCardinality(String), Decimal(18, 12)), cost_details Map(LowCardinality(String), Decimal(18, 12)),
  calculated_input_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> (positionCaseInsensitive(x.1, 'input') > 0), cost_details))),
  calculated_output_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> (positionCaseInsensitive(x.1, 'output') > 0), cost_details))),
  calculated_total_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> ((positionCaseInsensitive(x.1, 'input') > 0) OR (positionCaseInsensitive(x.1, 'output') > 0)), cost_details))),
  total_cost Decimal(18, 12) ALIAS cost_details['total'],
  processed_at DateTime64(3, 'UTC'), metadata String CODEC(ZSTD(3)),
  PROJECTION latest_source_versions (SELECT project_id, facet_id, facet_version, trace_id, session_id, unit_start_time, processed_at
    ORDER BY project_id, facet_id, trace_id, if(trace_id = '', session_id, ''), facet_version))
ENGINE = ReplacingMergeTree(processed_at) PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, toStartOfMinute(unit_start_time), facet_id, facet_version)
ORDER BY (project_id, toStartOfMinute(unit_start_time), facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''))
SETTINGS deduplicate_merge_projection_mode = 'rebuild', lightweight_mutation_projection_mode = 'rebuild', index_granularity = 8192, max_bytes_to_merge_at_max_space_in_pool = 2147483648;


CREATE TABLE topics_schema_exp.sum_A (
  project_id String, facet_id String, facet_version UInt32, trace_id String DEFAULT '', session_id String DEFAULT '',
  environment LowCardinality(String), trace_name String DEFAULT '', unit_start_time DateTime64(3, 'UTC'),
  trigger_type LowCardinality(String) DEFAULT 'manual_poc', processing_state Enum8('complete' = 2, 'not_applicable' = 3, 'insufficient_input' = 4),
  summary String CODEC(ZSTD(3)), embedding Array(BFloat16), transcript_id String DEFAULT 'poc', transcript_version LowCardinality(String) DEFAULT 'poc',
  summary_model LowCardinality(String), embedding_model LowCardinality(String),
  provided_usage_details Map(LowCardinality(String), UInt64), usage_details Map(LowCardinality(String), UInt64),
  provided_cost_details Map(LowCardinality(String), Decimal(18, 12)), cost_details Map(LowCardinality(String), Decimal(18, 12)),
  calculated_input_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> (positionCaseInsensitive(x.1, 'input') > 0), cost_details))),
  calculated_output_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> (positionCaseInsensitive(x.1, 'output') > 0), cost_details))),
  calculated_total_cost Decimal(18, 12) MATERIALIZED arraySum(mapValues(mapFilter(x -> ((positionCaseInsensitive(x.1, 'input') > 0) OR (positionCaseInsensitive(x.1, 'output') > 0)), cost_details))),
  total_cost Decimal(18, 12) ALIAS cost_details['total'],
  processed_at DateTime64(3, 'UTC'), metadata String CODEC(ZSTD(3)),
  unit_hash UInt64 MATERIALIZED cityHash64(if(trace_id = '', session_id, trace_id)),
  rule_ids Array(String) DEFAULT [],
  INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_session_id session_id TYPE bloom_filter(0.001) GRANULARITY 1)
ENGINE = ReplacingMergeTree(processed_at) PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, toDate(unit_start_time), facet_id, facet_version, unit_hash)
ORDER BY (project_id, toDate(unit_start_time), facet_id, facet_version, unit_hash) SETTINGS index_granularity = 8192, max_bytes_to_merge_at_max_space_in_pool = 2147483648;
CREATE TABLE topics_schema_exp.asg_main (project_id String, facet_id String, facet_version UInt32, trace_id String DEFAULT '', session_id String DEFAULT '',
  environment LowCardinality(String), trace_name String DEFAULT '', unit_start_time DateTime64(3, 'UTC'), summary_processed_at DateTime64(3, 'UTC'),
  clustering_run_id String DEFAULT '', topic_id String DEFAULT '', topic_version_id String DEFAULT '',
  distance Nullable(Float32), runner_up_distance Nullable(Float32), origin Enum8('initial' = 1, 'online' = 2, 'backfill' = 3), coordinates Array(Float32) DEFAULT [], assigned_at DateTime64(3, 'UTC'),
  INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1)
ENGINE = ReplacingMergeTree(assigned_at) PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, toStartOfMinute(unit_start_time), facet_id, facet_version)
ORDER BY (project_id, toStartOfMinute(unit_start_time), facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), clustering_run_id, origin)
SETTINGS enable_block_number_column = 1, enable_block_offset_column = 1, index_granularity = 8192, max_bytes_to_merge_at_max_space_in_pool = 2147483648;
CREATE TABLE topics_schema_exp.asg_AB (rule_id String DEFAULT '', project_id String, facet_id String, facet_version UInt32, trace_id String DEFAULT '', session_id String DEFAULT '',
  environment LowCardinality(String), trace_name String DEFAULT '', unit_start_time DateTime64(3, 'UTC'), summary_processed_at DateTime64(3, 'UTC'),
  clustering_run_id String DEFAULT '', topic_id String DEFAULT '', topic_version_id String DEFAULT '',
  distance Nullable(Float32), runner_up_distance Nullable(Float32), origin Enum8('initial' = 1, 'online' = 2), coordinates Array(Float32) DEFAULT [], assigned_at DateTime64(3, 'UTC'),
  unit_hash UInt64 MATERIALIZED cityHash64(if(trace_id = '', session_id, trace_id)),
  INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_session_id session_id TYPE bloom_filter(0.001) GRANULARITY 1)
ENGINE = ReplacingMergeTree(assigned_at) PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, facet_id, rule_id, clustering_run_id, topic_id, toStartOfHour(unit_start_time))
ORDER BY (project_id, facet_id, rule_id, clustering_run_id, topic_id, toStartOfHour(unit_start_time), unit_hash) SETTINGS index_granularity = 8192, max_bytes_to_merge_at_max_space_in_pool = 2147483648;
-- Proposal: narrow time-ordered lookup for trace to topic (filled from asg_AB after seeding; an MV in production)
CREATE TABLE topics_schema_exp.asg_AB_by_time (project_id String, unit_start_time DateTime64(3, 'UTC'), facet_id String, rule_id String, trace_id String, session_id String,
  clustering_run_id String, topic_id String, topic_version_id String, assigned_at DateTime64(3, 'UTC'), origin Enum8('initial' = 1, 'online' = 2),
  INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1)
ENGINE = ReplacingMergeTree(assigned_at) PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, toStartOfMinute(unit_start_time), facet_id)
ORDER BY (project_id, toStartOfMinute(unit_start_time), facet_id, trace_id, session_id, rule_id, clustering_run_id)
SETTINGS max_bytes_to_merge_at_max_space_in_pool = 2147483648;
