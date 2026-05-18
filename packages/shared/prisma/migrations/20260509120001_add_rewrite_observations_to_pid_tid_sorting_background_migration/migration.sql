-- M2 of the V4 self-hosted historic backfill chain (LFE-8833).
-- Rewrites the live `observations` table into `observations_pid_tid_sorting`,
-- a scratch table sorted by (project_id, hash(trace_id), span_id) so that M3's
-- chunked LEFT ANY JOIN against `traces` is index-aligned.
--
-- M2 lazily creates the scratch table inside validate() and issues
-- `SYSTEM STOP MERGES` against it during the rewrite. The scratch table is
-- dropped by M5 once the operator confirms the v4 path is healthy.
--
-- Gated by `LANGFUSE_MIGRATION_V4_ENABLE_HISTORIC_BACKFILL`.
--
-- The UUID, name, and script must stay in sync with
-- worker/src/backgroundMigrations/rewriteObservationsToPidTidSorting.ts.
INSERT INTO background_migrations (id, name, script, args)
VALUES (
  '9c2d5a4f-7b8e-4f6a-a91c-3e5d7f8a2b1c',
  '20260509_v4_step_2_rewrite_observations_to_pid_tid_sorting',
  'rewriteObservationsToPidTidSorting',
  '{
    "envGate": "LANGFUSE_MIGRATION_V4_ENABLE_HISTORIC_BACKFILL",
    "concurrency": 1,
    "pollIntervalMs": 30000,
    "maxRetries": 3
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
