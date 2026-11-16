-- Restore zero for future omitted values without rewriting persisted sizes.
-- An explicit constant default keeps rollback repeatable.
ALTER TABLE events_full {CLICKHOUSE_CLUSTER_CLAUSE}
    MODIFY COLUMN event_bytes UInt64 DEFAULT 0
    SETTINGS enable_full_text_index = 1{CLICKHOUSE_CLUSTERED_ONLY:, alter_sync = 2};
