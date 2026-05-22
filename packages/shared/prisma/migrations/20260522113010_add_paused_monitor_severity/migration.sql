-- Add PAUSED to MonitorSeverity (positioned first so `severity DESC` sinks
-- paused monitors to the bottom) and backfill non-ACTIVE rows. The enum is
-- recreated rather than evolved via ALTER TYPE ADD VALUE so the new value is
-- usable in the same migration's backfill (Postgres otherwise requires a
-- separate transaction before a newly-added enum value can be referenced).
ALTER TYPE "MonitorSeverity" RENAME TO "MonitorSeverity_old";

CREATE TYPE "MonitorSeverity" AS ENUM (
  'PAUSED',
  'UNKNOWN',
  'NO_DATA',
  'OK',
  'WARNING',
  'ALERT'
);

ALTER TABLE monitors
  ALTER COLUMN severity DROP DEFAULT,
  ALTER COLUMN severity TYPE "MonitorSeverity"
    USING severity::text::"MonitorSeverity",
  ALTER COLUMN severity SET DEFAULT 'UNKNOWN'::"MonitorSeverity";

DROP TYPE "MonitorSeverity_old";

-- Backfill existing non-ACTIVE rows (PAUSED + ERROR_BAD_QUERY) so the list
-- view renders them with the new "paused" appearance from the first deploy.
-- New transitions are written by MonitorService.update going forward.
UPDATE monitors SET severity = 'PAUSED' WHERE status <> 'ACTIVE';
