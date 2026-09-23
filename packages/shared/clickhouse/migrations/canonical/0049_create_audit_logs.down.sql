-- WARNING: destructive rollback. Drops every audit log row stored in
-- ClickHouse, including access events that have no Postgres copy.
DROP TABLE IF EXISTS audit_logs {CLICKHOUSE_CLUSTER_CLAUSE};
