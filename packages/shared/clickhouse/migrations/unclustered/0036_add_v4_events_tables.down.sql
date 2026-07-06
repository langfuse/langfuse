-- Drop the V4 events pipeline tables (unclustered).
-- Reverse order: the materialized view feeds events_core, so drop it first.
DROP VIEW IF EXISTS events_core_mv;
DROP TABLE IF EXISTS events_core;
DROP TABLE IF EXISTS events_full;
DROP TABLE IF EXISTS observations_batch_staging;
