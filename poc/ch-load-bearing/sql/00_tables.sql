-- PoC schema: mirrors events_full (0039) for everything the OTel path fills,
-- same engine/keys. Omits experiment/updateable/cost blocks and the
-- experimental `text` FTS indexes (ngrambf below matches migration 0043).
-- PoC extras at the bottom: media uploader contract + v1-compat raw column.
CREATE DATABASE IF NOT EXISTS poc_chlb;

CREATE TABLE IF NOT EXISTS poc_chlb.events_poc
(
    project_id      String,
    trace_id        String,
    span_id         String,
    parent_span_id  String,
    start_time      DateTime64(6),
    end_time        Nullable(DateTime64(6)),

    -- Core properties
    name            String,
    type            LowCardinality(String),
    environment     LowCardinality(String) DEFAULT 'default',
    version         String,
    release         String,
    trace_name      String,
    user_id         String,
    session_id      String,
    tags            Array(String),
    level           LowCardinality(String),
    status_message  String,

    -- Prompt
    prompt_id       String,
    prompt_name     String,
    prompt_version  Nullable(UInt16),

    -- Model
    model_id        String,
    provided_model_name String,
    model_parameters String,

    -- Usage
    provided_usage_details Map(LowCardinality(String), UInt64),
    usage_details   Map(LowCardinality(String), UInt64),

    -- I/O
    input           String CODEC(ZSTD(3)),
    output          String CODEC(ZSTD(3)),

    -- Metadata (parallel arrays, as in events_full)
    metadata_names  Array(String),
    metadata_values Array(String),

    -- Source metadata (instrumentation)
    source          LowCardinality(String),
    service_name    String,
    service_version String,
    scope_name      String,
    scope_version   String,
    telemetry_sdk_language LowCardinality(String),
    telemetry_sdk_name     String,
    telemetry_sdk_version  String,

    -- Generic props
    blob_storage_file_path String,
    event_bytes     UInt64,
    event_ts        DateTime64(6) DEFAULT now64(6),
    is_deleted      UInt8 DEFAULT 0,

    -- PoC extras
    span_kind       UInt8,
    has_media       UInt8,
    media_manifest  Array(Tuple(
                        media_id     String,
                        content_type String,
                        field        String,
                        byte_offset  UInt32,
                        byte_length  UInt32)),
    attributes_raw  String CODEC(ZSTD(3)),  -- written by legacy v1 only

    INDEX idx_span_id span_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_user_id user_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_ngram_metadata_values arrayStringConcat(metadata_values)
        TYPE ngrambf_v1(4, 32000, 3, 0) GRANULARITY 2
)
ENGINE = ReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toYYYYMM(start_time)
PRIMARY KEY (project_id, toStartOfMinute(start_time), xxHash32(trace_id))
ORDER BY (project_id, toStartOfMinute(start_time), xxHash32(trace_id), span_id, start_time)
SAMPLE BY xxHash32(trace_id)
SETTINGS index_granularity_bytes = '64Mi', merge_max_block_size_bytes = '64Mi';

CREATE TABLE IF NOT EXISTS poc_chlb.events_poc_staging_0 AS poc_chlb.events_poc;
CREATE TABLE IF NOT EXISTS poc_chlb.events_poc_staging_1 AS poc_chlb.events_poc;
CREATE TABLE IF NOT EXISTS poc_chlb.events_poc_staging_2 AS poc_chlb.events_poc;
CREATE TABLE IF NOT EXISTS poc_chlb.events_poc_staging_3 AS poc_chlb.events_poc;
