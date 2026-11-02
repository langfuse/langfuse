-- M3 of the V4 self-hosted historic backfill chain.
-- Reads `observations_pid_tid_sorting` (produced by M2) LEFT ANY JOIN with the
-- live `traces` table and writes child events into `events_full`. Trace
-- properties are propagated lightly (name, user_id, session_id, version,
-- release, tags, public, bookmarked); metadata is intentionally not copied to
-- keep the join cheap on self-hoster hardware. Observations of DRI-referenced
-- traces are skipped here and owned end-to-end by M4.
--
-- Gated by `LANGFUSE_BACKGROUND_MIGRATION_V4_ENABLE_HISTORIC_BACKFILL`.
INSERT INTO background_migrations (id, name, script, args)
VALUES (
  '7a3f8d6e-2c91-4b5e-8d72-f4a5b6c7d8e9',
  '20260701_v4_step_3_backfill_events_full_from_observations',
  'backfillEventsFullFromObservations',
  '{"envGate": "LANGFUSE_BACKGROUND_MIGRATION_V4_ENABLE_HISTORIC_BACKFILL"}'::jsonb
);
