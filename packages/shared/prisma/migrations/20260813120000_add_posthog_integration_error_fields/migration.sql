ALTER TABLE "posthog_integrations" ADD COLUMN IF NOT EXISTS "last_error" TEXT;
ALTER TABLE "posthog_integrations" ADD COLUMN IF NOT EXISTS "last_error_at" TIMESTAMP(3);
