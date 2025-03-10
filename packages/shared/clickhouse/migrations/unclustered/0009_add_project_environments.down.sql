-- Drop materialized views
DROP VIEW IF EXISTS project_environments_traces_mv;
DROP VIEW IF EXISTS project_environments_observations_mv;
DROP VIEW IF EXISTS project_environments_scores_mv;

-- Drop the project_environments table
DROP TABLE IF EXISTS project_environments;
