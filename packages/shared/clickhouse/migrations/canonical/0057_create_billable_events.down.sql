-- Stops the ledger from filling but keeps billable_events: it is billing
-- history that no source table can rebuild. Drop it by hand if it must go.
DROP VIEW IF EXISTS billable_events_scores_mv {CLICKHOUSE_CLUSTER_CLAUSE};
DROP VIEW IF EXISTS billable_events_traces_mv {CLICKHOUSE_CLUSTER_CLAUSE};
DROP VIEW IF EXISTS billable_events_observations_mv {CLICKHOUSE_CLUSTER_CLAUSE};
