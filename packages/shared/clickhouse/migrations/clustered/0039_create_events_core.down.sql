-- WARNING: destructive rollback. The up migration uses IF NOT EXISTS, so this
-- table may predate this migration (created via dev-tables.sh on v4 preview
-- deployments) and may hold production-grade event data. Rolling back drops
-- that data regardless of which path created the table.
DROP TABLE IF EXISTS events_core ON CLUSTER default;
