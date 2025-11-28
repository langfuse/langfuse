-- Drop materialized views
DROP VIEW IF EXISTS project_environments_traces_mv ON CLUSTER ${CLICKHOUSE_CLUSTER_NAME};
DROP VIEW IF EXISTS project_environments_observations_mv ON CLUSTER ${CLICKHOUSE_CLUSTER_NAME};
DROP VIEW IF EXISTS project_environments_scores_mv ON CLUSTER ${CLICKHOUSE_CLUSTER_NAME};

-- Drop the project_environments table
DROP TABLE IF EXISTS project_environments ON CLUSTER ${CLICKHOUSE_CLUSTER_NAME};
