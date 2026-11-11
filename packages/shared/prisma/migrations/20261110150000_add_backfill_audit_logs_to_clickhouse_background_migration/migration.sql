-- Copies the Postgres audit_logs rows into the ClickHouse audit_logs table.
-- Rows that auditLog() has already staged for ClickHouse are skipped.
-- Does nothing where the row exists already, e.g. because it was inserted by
-- hand to run the backfill before this migration was deployed.
INSERT INTO background_migrations (id, name, script, args)
VALUES (
  'e70a9ca9-ad90-4419-a86e-4f4e2a4b7fa2',
  '20261110_backfill_audit_logs_to_clickhouse',
  'backfillAuditLogsToClickhouse',
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
