-- CockroachDB cannot run CREATE TYPE inside a DO block; CREATE TYPE IF NOT EXISTS
-- gives the same idempotence.

CREATE TYPE IF NOT EXISTS "StorageIntegrationAuthType" AS ENUM ('ACCESS_KEYS', 'ROLE_ARN');

ALTER TABLE "external_media_storage_integrations" ADD COLUMN IF NOT EXISTS "auth_type" "StorageIntegrationAuthType" NOT NULL DEFAULT 'ACCESS_KEYS';
ALTER TABLE "external_media_storage_integrations" ADD COLUMN IF NOT EXISTS "role_arn" TEXT;
ALTER TABLE "external_media_storage_integrations" ADD COLUMN IF NOT EXISTS "external_id" TEXT;
