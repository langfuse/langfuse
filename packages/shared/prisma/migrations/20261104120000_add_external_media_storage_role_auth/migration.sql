CREATE TYPE "StorageIntegrationAuthType" AS ENUM ('ACCESS_KEYS', 'ROLE_ARN');

ALTER TABLE "external_media_storage_integrations" ADD COLUMN "auth_type" "StorageIntegrationAuthType" NOT NULL DEFAULT 'ACCESS_KEYS';
ALTER TABLE "external_media_storage_integrations" ADD COLUMN "role_arn" TEXT;
ALTER TABLE "external_media_storage_integrations" ADD COLUMN "external_id" TEXT;
