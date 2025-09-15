-- Drop materialized views feeding the project_environments table

DROP VIEW IF EXISTS project_environments_traces_mv ON CLUSTER default;

DROP VIEW IF EXISTS project_environments_observations_mv ON CLUSTER default;

DROP VIEW IF EXISTS project_environments_scores_mv ON CLUSTER default;