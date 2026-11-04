ALTER TABLE "blob_storage_integrations" ADD COLUMN "auth_type" "StorageIntegrationAuthType" NOT NULL DEFAULT 'ACCESS_KEYS';
ALTER TABLE "blob_storage_integrations" ADD COLUMN "role_arn" TEXT;
ALTER TABLE "blob_storage_integrations" ADD COLUMN "external_id" TEXT;
