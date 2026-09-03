-- Recreate materialized views for project_environments table
CREATE MATERIALIZED VIEW project_environments_traces_mv {CLICKHOUSE_CLUSTER_CLAUSE} TO project_environments AS
SELECT
    project_id,
    groupUniqArray(environment) AS environments
FROM traces
GROUP BY project_id;

CREATE MATERIALIZED VIEW project_environments_observations_mv {CLICKHOUSE_CLUSTER_CLAUSE} TO project_environments AS
SELECT
    project_id,
    groupUniqArray(environment) AS environments
FROM observations
GROUP BY project_id;

CREATE MATERIALIZED VIEW project_environments_scores_mv {CLICKHOUSE_CLUSTER_CLAUSE} TO project_environments AS
SELECT
    project_id,
    groupUniqArray(environment) AS environments
FROM scores
GROUP BY project_id;{CLICKHOUSE_HISTORICAL_FINAL_NEWLINES:0}
