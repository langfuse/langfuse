-- The project_environments table has been unused since
-- 0027_drop_project_environments_mvs removed the materialized views feeding
-- it. getEnvironmentsForProject reads distinct environments from the tracing
-- and scores tables directly.
DROP TABLE IF EXISTS project_environments ON CLUSTER default;
