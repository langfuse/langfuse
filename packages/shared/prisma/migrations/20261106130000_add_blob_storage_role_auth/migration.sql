ALTER TABLE "blob_storage_integrations" ADD COLUMN IF NOT EXISTS "auth_type" "StorageIntegrationAuthType" NOT NULL DEFAULT 'ACCESS_KEYS';
ALTER TABLE "blob_storage_integrations" ADD COLUMN IF NOT EXISTS "role_arn" TEXT;
ALTER TABLE "blob_storage_integrations" ADD COLUMN IF NOT EXISTS "external_id" TEXT;
