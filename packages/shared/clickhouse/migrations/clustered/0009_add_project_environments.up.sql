-- Create the project_environments table with AggregatingMergeTree engine
CREATE TABLE project_environments ON CLUSTER default (
    `project_id` String,
    `environments` SimpleAggregateFunction(groupUniqArrayArray, Array(String))
) ENGINE = ReplicatedAggregatingMergeTree
ORDER BY (project_id);

-- Create materialized view for traces
CREATE MATERIALIZED VIEW project_environments_traces_mv ON CLUSTER default TO project_environments AS
SELECT
    project_id,
    groupUniqArray(environment) AS environments
FROM traces
GROUP BY project_id;

-- Create materialized view for observations
CREATE MATERIALIZED VIEW project_environments_observations_mv ON CLUSTER default TO project_environments AS
SELECT
    project_id,
    groupUniqArray(environment) AS environments
FROM observations
GROUP BY project_id;

-- Create materialized view for scores
CREATE MATERIALIZED VIEW project_environments_scores_mv ON CLUSTER default TO project_environments AS
SELECT
    project_id,
    groupUniqArray(environment) AS environments
FROM scores
GROUP BY project_id;
