ALTER TABLE "slack_integrations" ADD COLUMN IF NOT EXISTS "installer_user_id" TEXT,
ADD COLUMN IF NOT EXISTS "installer_slack_user_id" TEXT;
