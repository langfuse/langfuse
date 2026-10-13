-- WARNING: destructive rollback. Drops every audit log row stored in
-- ClickHouse.
DROP TABLE IF EXISTS audit_logs {CLICKHOUSE_CLUSTER_CLAUSE};
