-- Copies the Postgres audit_logs table into the ClickHouse audit_logs table,
-- which serves the audit log read path from this release on. Resumable via the
-- (created_at, id) cursor kept in `state`; safe to re-run because the
-- ClickHouse table dedupes on the row id.
INSERT INTO background_migrations (id, name, script, args)
VALUES (
  'b1f3c7a0-6d2e-4f9b-9c41-7a8e5d2b3c60',
  '20260910_backfill_audit_logs_to_clickhouse',
  'backfillAuditLogsToClickhouse',
  '{}'::jsonb
);
