-- Drop materialized views feeding project_environments table
DROP VIEW IF EXISTS project_environments_traces_mv {CLICKHOUSE_CLUSTER_CLAUSE};
DROP VIEW IF EXISTS project_environments_observations_mv {CLICKHOUSE_CLUSTER_CLAUSE};
DROP VIEW IF EXISTS project_environments_scores_mv {CLICKHOUSE_CLUSTER_CLAUSE};{CLICKHOUSE_HISTORICAL_FINAL_NEWLINES:0}
