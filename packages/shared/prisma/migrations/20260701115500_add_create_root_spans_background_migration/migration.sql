-- M1 of the V4 self-hosted historic backfill chain.
-- Creates virtual root spans in events_full from existing traces. Traces
-- referenced by a dataset run item are skipped here and owned end-to-end by M4.
--
-- Gated by `LANGFUSE_BACKGROUND_MIGRATION_V4_ENABLE_HISTORIC_BACKFILL` so this row ships
-- dormant on the final v3 release and activates when self-hosters opt in or
-- upgrade to v4 (which defaults the flag to true).
INSERT INTO background_migrations (id, name, script, args)
VALUES (
  '8e1f4a2b-5c63-4d8e-9a47-1b2f3c4d5e6f',
  '20260701_v4_step_1_create_root_spans_from_traces',
  'createRootSpansFromTraces',
  '{"envGate": "LANGFUSE_BACKGROUND_MIGRATION_V4_ENABLE_HISTORIC_BACKFILL"}'::jsonb
);
