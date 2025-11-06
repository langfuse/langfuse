-- Recreate materialized views for project_environments table
CREATE MATERIALIZED VIEW project_environments_traces_mv ON CLUSTER default TO project_environments AS
SELECT
    project_id,
    groupUniqArray(environment) AS environments
FROM traces
GROUP BY project_id;

CREATE MATERIALIZED VIEW project_environments_observations_mv ON CLUSTER default TO project_environments AS
SELECT
    project_id,
    groupUniqArray(environment) AS environments
FROM observations
GROUP BY project_id;

CREATE MATERIALIZED VIEW project_environments_scores_mv ON CLUSTER default TO project_environments AS
SELECT
    project_id,
    groupUniqArray(environment) AS environments
FROM scores
GROUP BY project_id;