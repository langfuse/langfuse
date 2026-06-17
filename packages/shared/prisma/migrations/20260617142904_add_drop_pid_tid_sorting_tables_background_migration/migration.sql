-- M5 of the V4 self-hosted historic backfill chain.
-- Cleanup-only migration: drops `observations_pid_tid_sorting` once the operator confirms the v4 read path is healthy.
--
-- Gated by `LANGFUSE_BACKGROUND_MIGRATION_V4_DROP_PID_TID_SORTING_TABLES` (separate from
-- the other gate) so users keep scratch tables for forensics until they're
-- confident.
INSERT INTO background_migrations (id, name, script, args)
VALUES (
  'b3f1c5d8-9e47-4a26-8b3f-5c6d7e8f9a01',
  '20260521_v4_step_5_drop_pid_tid_sorting_tables',
  'dropPidTidSortingTables',
  '{"envGate": "LANGFUSE_BACKGROUND_MIGRATION_V4_DROP_PID_TID_SORTING_TABLES"}'::jsonb
);
