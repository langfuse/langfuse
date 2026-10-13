ALTER TABLE observations {CLICKHOUSE_CLUSTER_CLAUSE} ADD COLUMN usage_pricing_tier_id Nullable(String){CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};
ALTER TABLE observations {CLICKHOUSE_CLUSTER_CLAUSE} ADD COLUMN usage_pricing_tier_name Nullable(String){CLICKHOUSE_CLUSTERED_ONLY: SETTINGS alter_sync = 2};
