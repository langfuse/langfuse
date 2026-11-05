-- Estimate customer payload, identifiers and descriptions, excluding internal
-- bookkeeping, derived values and copied experiment metadata.
-- DEFAULT accepts explicit sizes from older writers during rollout.
-- Existing rows retain their persisted values, with no historical mutation.
-- Keep this estimate stable across small schema additions. Include new large
-- customer payload fields through a later migration when needed.
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE}
    MODIFY COLUMN event_bytes UInt64 DEFAULT byteSize(
        input,
        output,
        metadata_names,
        metadata_values,
        trace_id,
        span_id,
        parent_span_id,
        user_id,
        session_id,
        name,
        trace_name,
        status_message
    )
    SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
