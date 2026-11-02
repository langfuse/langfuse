-- The traces, observations and scores tables were superseded by their
-- ClickHouse counterparts in v3. Their contents were copied over by the
-- 20241024_* background migrations, which must have completed (on the latest
-- v3 release) before upgrading to v4.
DROP TABLE IF EXISTS "traces";
DROP TABLE IF EXISTS "observations";
DROP TABLE IF EXISTS "scores";

-- These enum types were only used by the dropped tables.
DROP TYPE IF EXISTS "ObservationType";
DROP TYPE IF EXISTS "ObservationLevel";
DROP TYPE IF EXISTS "ScoreSource";

-- Remove the background migrations whose source tables are dropped above.
-- Their worker scripts are deleted alongside this migration, so leftover
-- unfinished rows would make the BackgroundMigrationManager fail to resolve
-- the script.
DELETE FROM "background_migrations"
WHERE "name" IN (
  '20241024_1216_add_generations_cost_backfill',
  '20241024_1730_migrate_traces_from_pg_to_ch',
  '20241024_1737_migrate_observations_from_pg_to_ch',
  '20241024_1738_migrate_scores_from_pg_to_ch'
);
