-- Drop the V4 events pipeline tables (clustered).
-- Reverse order: the materialized view feeds events_core, so drop it first.
DROP VIEW IF EXISTS events_core_mv ON CLUSTER default;
DROP TABLE IF EXISTS events_core ON CLUSTER default;
DROP TABLE IF EXISTS events_full ON CLUSTER default;
DROP TABLE IF EXISTS observations_batch_staging ON CLUSTER default;
