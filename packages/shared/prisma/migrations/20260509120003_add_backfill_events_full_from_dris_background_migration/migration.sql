-- M4 of the V4 self-hosted historic backfill chain (LFE-8833).
-- DRI-driven recursive enrichment: walks `dataset_run_items_rmt` newest-first,
-- finds the root span for each DRI's trace, copies the root + all descendants
-- into `events_full` with experiment_* fields populated.
--
-- All tunables are read from `args` so a self-hoster can override them
-- in-place via SQL on the row:
--   - concurrency: kept for parity with the other steps; M4 is JS-batched.
--   - batchSize: number of DRIs paginated per round (default 200).
--   - maxDescendantsPerDri: hard cap that converts a runaway trace into an
--     actionable error in `failedReason` rather than a silent OOM.
--   - lookbackDays: padding applied to the DRI created_at min/max when
--     fetching observations/traces (default 90).
--
-- Gated by `LANGFUSE_MIGRATION_V4_ENABLE_HISTORIC_BACKFILL`.
--
-- The UUID, name, and script must stay in sync with
-- worker/src/backgroundMigrations/backfillEventsFullFromDatasetRunItems.ts.
INSERT INTO background_migrations (id, name, script, args)
VALUES (
  '9d4f8a12-7b35-4e6c-9f48-a2b3c4d5e6f7',
  '20260509_v4_step_4_backfill_events_full_from_dataset_run_items',
  'backfillEventsFullFromDatasetRunItems',
  '{
    "envGate": "LANGFUSE_MIGRATION_V4_ENABLE_HISTORIC_BACKFILL",
    "concurrency": 1,
    "pollIntervalMs": 30000,
    "maxRetries": 3,
    "batchSize": 200,
    "maxDescendantsPerDri": 50000,
    "lookbackDays": 90
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
