DO $$ BEGIN
  CREATE TYPE "StorageIntegrationAuthType" AS ENUM ('ACCESS_KEYS', 'ROLE_ARN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "external_media_storage_integrations" ADD COLUMN IF NOT EXISTS "auth_type" "StorageIntegrationAuthType" NOT NULL DEFAULT 'ACCESS_KEYS';
ALTER TABLE "external_media_storage_integrations" ADD COLUMN IF NOT EXISTS "role_arn" TEXT;
ALTER TABLE "external_media_storage_integrations" ADD COLUMN IF NOT EXISTS "external_id" TEXT;
