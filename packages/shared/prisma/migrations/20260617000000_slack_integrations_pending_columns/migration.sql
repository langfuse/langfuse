-- Make project_id nullable so a Slack installation can exist before being linked
-- to a project (Marketplace install-then-link flow). The existing unique index
-- on project_id keeps mapping linked projects 1:1; Postgres treats NULLs as
-- distinct, so multiple unlinked (pending) rows can coexist.
ALTER TABLE "slack_integrations" ALTER COLUMN "project_id" DROP NOT NULL;

-- Pending-only columns (NULL once the install is linked to a project).
ALTER TABLE "slack_integrations" ADD COLUMN "expires_at" TIMESTAMP(3);

-- One-time claim token hash: the raw token is carried only by the onboarding
-- URL and is required before a pending install can be linked to a project.
ALTER TABLE "slack_integrations" ADD COLUMN "claim_token_hash" TEXT;

-- Index to purge expired pending installs efficiently.
CREATE INDEX "slack_integrations_expires_at_idx" ON "slack_integrations"("expires_at");
