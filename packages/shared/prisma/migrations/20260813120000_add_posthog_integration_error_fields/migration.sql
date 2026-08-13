ALTER TABLE "posthog_integrations" ADD COLUMN IF NOT EXISTS "last_error" TEXT;
ALTER TABLE "posthog_integrations" ADD COLUMN IF NOT EXISTS "last_error_at" TIMESTAMP(3);
ALTER TABLE "posthog_integrations" ADD COLUMN IF NOT EXISTS "last_failure_notification_sent_at" TIMESTAMP(3);
