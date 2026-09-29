ALTER TABLE "blob_storage_integrations" ADD COLUMN "backfill" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "posthog_integrations" ADD COLUMN "backfill" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "mixpanel_integrations" ADD COLUMN "backfill" BOOLEAN NOT NULL DEFAULT true;
