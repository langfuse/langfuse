-- M3 of the V4 self-hosted historic backfill chain (LFE-8833).
-- Reads `observations_pid_tid_sorting` (produced by M2) LEFT ANY JOIN with the
-- live `traces` table and writes child events into `events_full`. Trace
-- properties are propagated lightly (name, user_id, session_id, version,
-- release, tags, public, bookmarked); metadata is intentionally not copied to
-- keep the join cheap on self-hoster hardware.
--
-- Gated by `LANGFUSE_MIGRATION_V4_ENABLE_HISTORIC_BACKFILL`.
--
-- The UUID, name, and script must stay in sync with
-- worker/src/backgroundMigrations/backfillEventsFullFromObservations.ts.
INSERT INTO background_migrations (id, name, script, args)
VALUES (
  '7a3f8d6e-2c91-4b5e-8d72-f4a5b6c7d8e9',
  '20260509_v4_step_3_backfill_events_full_from_observations',
  'backfillEventsFullFromObservations',
  '{
    "envGate": "LANGFUSE_MIGRATION_V4_ENABLE_HISTORIC_BACKFILL",
    "concurrency": 1,
    "pollIntervalMs": 30000,
    "maxRetries": 3
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
