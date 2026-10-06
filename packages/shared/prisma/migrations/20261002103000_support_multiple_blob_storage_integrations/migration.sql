ALTER TABLE "blob_storage_integrations"
ADD COLUMN IF NOT EXISTS "id" TEXT,
ADD COLUMN IF NOT EXISTS "media_storage_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "media_prefix" TEXT;

-- Preserve the public identifier used by existing integrations.
UPDATE "blob_storage_integrations"
SET "id" = "project_id"
WHERE "id" IS NULL;

ALTER TABLE "blob_storage_integrations"
ALTER COLUMN "id" SET NOT NULL,
ADD CONSTRAINT "blob_storage_integrations_id_key" UNIQUE ("id");

-- Old web pods omit id and upsert on project_id while a rolling deployment is
-- in progress. Keep project_id as the primary key in this expand migration and
-- derive the new identifier for those writes until a later deployment moves
-- the primary key to id.
CREATE OR REPLACE FUNCTION "set_blob_storage_integration_id"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."id" IS NULL THEN
    NEW."id" := NEW."project_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "set_blob_storage_integration_id"
ON "blob_storage_integrations";

CREATE TRIGGER "set_blob_storage_integration_id"
BEFORE INSERT ON "blob_storage_integrations"
FOR EACH ROW
EXECUTE FUNCTION "set_blob_storage_integration_id"();
