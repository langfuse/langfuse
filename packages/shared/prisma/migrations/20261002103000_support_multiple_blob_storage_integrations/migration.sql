ALTER TABLE "blob_storage_integrations"
ADD COLUMN "id" TEXT,
ADD COLUMN "owner_project_id" TEXT,
ADD COLUMN "media_storage_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the public identifier used by existing integrations.
UPDATE "blob_storage_integrations"
SET "id" = "project_id",
    "owner_project_id" = "project_id";

ALTER TABLE "blob_storage_integrations"
ALTER COLUMN "id" SET NOT NULL,
ALTER COLUMN "owner_project_id" SET NOT NULL,
ALTER COLUMN "project_id" DROP NOT NULL,
DROP CONSTRAINT "blob_storage_integrations_pkey",
ADD CONSTRAINT "blob_storage_integrations_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "blob_storage_integrations_project_id_key"
ON "blob_storage_integrations"("project_id");

CREATE INDEX "blob_storage_integrations_owner_project_id_idx"
ON "blob_storage_integrations"("owner_project_id");

ALTER TABLE "blob_storage_integrations"
ADD CONSTRAINT "blob_storage_integrations_owner_project_id_fkey"
FOREIGN KEY ("owner_project_id") REFERENCES "projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
