-- WARNING: destructive rollback. The up migration uses IF NOT EXISTS, so this
-- view may predate this migration (created via dev-tables.sh on v4 preview
-- deployments). Dropping it stops events_core from being populated.
DROP VIEW IF EXISTS events_core_mv;
