-- Drop materialized views feeding project_environments table
DROP VIEW IF EXISTS project_environments_traces_mv;
DROP VIEW IF EXISTS project_environments_observations_mv;
DROP VIEW IF EXISTS project_environments_scores_mv;