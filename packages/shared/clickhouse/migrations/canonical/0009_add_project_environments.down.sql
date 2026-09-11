-- Drop materialized views
DROP VIEW IF EXISTS project_environments_traces_mv {CLICKHOUSE_CLUSTER_CLAUSE};
DROP VIEW IF EXISTS project_environments_observations_mv {CLICKHOUSE_CLUSTER_CLAUSE};
DROP VIEW IF EXISTS project_environments_scores_mv {CLICKHOUSE_CLUSTER_CLAUSE};

-- Drop the project_environments table
DROP TABLE IF EXISTS project_environments {CLICKHOUSE_CLUSTER_CLAUSE};
