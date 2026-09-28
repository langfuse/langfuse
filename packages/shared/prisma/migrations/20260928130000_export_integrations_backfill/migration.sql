ALTER TABLE "blob_storage_integrations" ADD COLUMN "backfill" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "posthog_integrations" ADD COLUMN "backfill" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "mixpanel_integrations" ADD COLUMN "backfill" BOOLEAN NOT NULL DEFAULT true;

-- A caught-up integration's lastSyncAt trails now by at most one export period
-- plus the lag buffer, so anything older (or never synced) is still backfilling.
UPDATE "blob_storage_integrations"
SET "backfill" = "last_sync_at" IS NULL OR "last_sync_at" < now() - interval '1 hour' - CASE "export_frequency"
  WHEN 'every_20_minutes' THEN interval '20 minutes'
  WHEN 'hourly' THEN interval '1 hour'
  WHEN 'daily' THEN interval '1 day'
  WHEN 'weekly' THEN interval '7 days'
  ELSE interval '0'
END;

UPDATE "posthog_integrations"
SET "backfill" = "last_sync_at" IS NULL OR "last_sync_at" < now() - interval '2 hours';

UPDATE "mixpanel_integrations"
SET "backfill" = "last_sync_at" IS NULL OR "last_sync_at" < now() - interval '2 hours';
