-- Copies the Postgres audit_logs rows into the ClickHouse audit_logs table.
-- Rows that auditLog() has already staged for ClickHouse are skipped.
INSERT INTO background_migrations (id, name, script, args)
VALUES (
  'e70a9ca9-ad90-4419-a86e-4f4e2a4b7fa2',
  '20261016_backfill_audit_logs_to_clickhouse',
  'backfillAuditLogsToClickhouse',
  '{}'::jsonb
);
