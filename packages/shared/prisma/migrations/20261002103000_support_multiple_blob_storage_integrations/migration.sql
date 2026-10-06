ALTER TABLE "blob_storage_integrations"
ADD COLUMN IF NOT EXISTS "id" TEXT,
ADD COLUMN IF NOT EXISTS "media_storage_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "media_prefix" TEXT;

-- Preserve the public identifier used by existing integrations.
UPDATE "blob_storage_integrations"
SET "id" = "project_id";

ALTER TABLE "blob_storage_integrations"
ALTER COLUMN "id" SET NOT NULL,
DROP CONSTRAINT "blob_storage_integrations_pkey",
ADD CONSTRAINT "blob_storage_integrations_pkey" PRIMARY KEY ("id");

CREATE INDEX IF NOT EXISTS "blob_storage_integrations_project_id_idx"
ON "blob_storage_integrations"("project_id");
