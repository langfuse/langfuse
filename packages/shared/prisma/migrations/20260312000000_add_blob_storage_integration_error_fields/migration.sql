ALTER TABLE "blob_storage_integrations" ADD COLUMN IF NOT EXISTS "last_error" TEXT;
ALTER TABLE "blob_storage_integrations" ADD COLUMN IF NOT EXISTS "last_error_at" TIMESTAMP(3);
