ALTER TABLE "blob_storage_integrations" ADD COLUMN IF NOT EXISTS "last_failure_notification_sent_at" TIMESTAMP(3);
