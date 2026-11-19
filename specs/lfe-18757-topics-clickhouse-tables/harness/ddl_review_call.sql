CREATE TABLE topics_schema_exp.sum_M (
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
PRIMARY KEY (project_id, toStartOfMinute(unit_start_time), facet_id)
ORDER BY (project_id, toStartOfMinute(unit_start_time), facet_id, facet_version, unit_hash) SETTINGS index_granularity = 8192, max_bytes_to_merge_at_max_space_in_pool = 2147483648;
CREATE TABLE topics_schema_exp.sum_M_ptr (project_id String, facet_id String, trace_id String, session_id String, facet_version UInt32, unit_start_time DateTime64(3, 'UTC'))
ENGINE = ReplacingMergeTree PARTITION BY toYYYYMM(unit_start_time) ORDER BY (project_id, facet_id, trace_id, session_id, facet_version, unit_start_time)
SETTINGS max_bytes_to_merge_at_max_space_in_pool = 2147483648;
CREATE MATERIALIZED VIEW topics_schema_exp.sum_M_ptr_mv TO topics_schema_exp.sum_M_ptr AS
SELECT project_id, facet_id, trace_id, session_id, facet_version, unit_start_time FROM topics_schema_exp.sum_M;
CREATE TABLE topics_schema_exp.asg_M (rule_id String DEFAULT '', project_id String, facet_id String, facet_version UInt32, trace_id String DEFAULT '', session_id String DEFAULT '',
  environment LowCardinality(String), trace_name String DEFAULT '', unit_start_time DateTime64(3, 'UTC'), summary_processed_at DateTime64(3, 'UTC'),
  clustering_run_id String DEFAULT '', topic_id String DEFAULT '', topic_version_id String DEFAULT '',
  distance Nullable(Float32), runner_up_distance Nullable(Float32), origin Enum8('initial' = 1, 'online' = 2), coordinates Array(Float32) DEFAULT [], assigned_at DateTime64(3, 'UTC'),
  unit_hash UInt64 MATERIALIZED cityHash64(if(trace_id = '', session_id, trace_id)),
  INDEX idx_trace_id trace_id TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_session_id session_id TYPE bloom_filter(0.001) GRANULARITY 1,
  INDEX idx_rule_id rule_id TYPE bloom_filter(0.01) GRANULARITY 1)
ENGINE = ReplacingMergeTree(assigned_at) PARTITION BY toYYYYMM(unit_start_time)
PRIMARY KEY (project_id, facet_id, toStartOfMinute(unit_start_time))
ORDER BY (project_id, facet_id, toStartOfMinute(unit_start_time), clustering_run_id, unit_hash) SETTINGS index_granularity = 8192, max_bytes_to_merge_at_max_space_in_pool = 2147483648;