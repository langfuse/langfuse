-- Revert the Marketplace install-then-link schema changes: drop the pending-only
-- columns and restore the 1:1 project mapping (project_id NOT NULL).
--
-- Pending (unlinked) installs have a NULL project_id and cannot satisfy the
-- restored NOT NULL constraint, so delete them first. They are short-lived,
-- never linked to a project, and hold no live integration, so dropping them is
-- safe.
DELETE FROM "slack_integrations" WHERE "project_id" IS NULL;

-- Drop the index that backed expired-pending purges.
DROP INDEX IF EXISTS "slack_integrations_expires_at_idx";

-- Drop the pending-only columns.
ALTER TABLE "slack_integrations" DROP COLUMN IF EXISTS "expires_at";
ALTER TABLE "slack_integrations" DROP COLUMN IF EXISTS "claim_token_hash";

-- Restore the 1:1 project mapping.
ALTER TABLE "slack_integrations" ALTER COLUMN "project_id" SET NOT NULL;
