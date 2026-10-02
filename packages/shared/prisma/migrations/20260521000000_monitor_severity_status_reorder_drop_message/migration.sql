-- AlterEnum: reorder MonitorSeverity so DESC sorts most-critical first
-- (ALERT, WARNING, OK, NO_DATA, UNKNOWN).
BEGIN;
CREATE TYPE "MonitorSeverity_new" AS ENUM ('UNKNOWN', 'NO_DATA', 'OK', 'WARNING', 'ALERT');
ALTER TABLE "monitors" ALTER COLUMN "severity" DROP DEFAULT;
ALTER TABLE "monitors" ALTER COLUMN "severity" TYPE "MonitorSeverity_new" USING ("severity"::text::"MonitorSeverity_new");
ALTER TYPE "MonitorSeverity" RENAME TO "MonitorSeverity_old";
ALTER TYPE "MonitorSeverity_new" RENAME TO "MonitorSeverity";
DROP TYPE "MonitorSeverity_old";
ALTER TABLE "monitors" ALTER COLUMN "severity" SET DEFAULT 'UNKNOWN';
COMMIT;

-- AlterEnum: reorder MonitorStatus so DESC sorts in attention-priority order
-- (ERROR_BAD_QUERY, ACTIVE, PAUSED).
BEGIN;
CREATE TYPE "MonitorStatus_new" AS ENUM ('PAUSED', 'ACTIVE', 'ERROR_BAD_QUERY');
ALTER TABLE "monitors" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "monitors" ALTER COLUMN "status" TYPE "MonitorStatus_new" USING ("status"::text::"MonitorStatus_new");
ALTER TYPE "MonitorStatus" RENAME TO "MonitorStatus_old";
ALTER TYPE "MonitorStatus_new" RENAME TO "MonitorStatus";
DROP TYPE "MonitorStatus_old";
ALTER TABLE "monitors" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterTable: drop the unused message column (templating removed for v1).
ALTER TABLE "monitors" DROP COLUMN "message";
