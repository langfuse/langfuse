-- Rows written by the sampled Rust shadow run (LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE).
-- Not a migration: run it once in the ingestion writer's database before enabling
-- sampling, and drop and recreate the table after a migration changes the
-- events_full columns. Parts expire an hour into the day after they were
-- written, which leaves the comparison time to read rows written before
-- midnight; project and trace deletion do not reach this table. Granules are small so
-- the comparison read stays cheap on this side.
-- The statement suits ClickHouse Cloud and a single node. On a self-managed
-- replicated cluster, add ON CLUSTER and a Replicated engine as the events_full
-- migration does; otherwise the table exists on one node only.
CREATE TABLE IF NOT EXISTS events_native_test AS events_full
ENGINE = ReplacingMergeTree(event_ts, is_deleted)
PARTITION BY toDate(toTimeZone(created_at, 'UTC'))
PRIMARY KEY (project_id, toStartOfMinute(start_time), xxHash32(trace_id))
ORDER BY (project_id, toStartOfMinute(start_time), xxHash32(trace_id), span_id, start_time)
SAMPLE BY xxHash32(trace_id)
TTL toStartOfDay(toTimeZone(created_at, 'UTC')) + INTERVAL 1 DAY + INTERVAL 1 HOUR DELETE
SETTINGS
    index_granularity_bytes = '1Mi',
    merge_max_block_size_bytes = '64Mi',
    enable_block_number_column = 1,
    enable_block_offset_column = 1,
    prewarm_mark_cache = 1,
    prewarm_primary_key_cache = 1,
    enable_full_text_index = 1,
    ttl_only_drop_parts = 1;
