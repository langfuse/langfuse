ALTER TABLE "blob_storage_integrations"
ADD COLUMN IF NOT EXISTS "id" TEXT,
ADD COLUMN IF NOT EXISTS "media_storage_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "media_prefix" TEXT;

-- Preserve the public identifier used by existing integrations.
UPDATE "blob_storage_integrations"
SET "id" = "project_id";

CREATE FUNCTION "set_blob_storage_integration_compatibility_columns"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."id" IS NULL THEN
    NEW."id" := NEW."project_id";
  END IF;
  IF NEW."owner_project_id" IS NULL THEN
    NEW."owner_project_id" := NEW."project_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "set_blob_storage_integration_compatibility_columns"
BEFORE INSERT OR UPDATE ON "blob_storage_integrations"
FOR EACH ROW EXECUTE FUNCTION "set_blob_storage_integration_compatibility_columns"();

ALTER TABLE "blob_storage_integrations"
ALTER COLUMN "id" SET NOT NULL,
DROP CONSTRAINT "blob_storage_integrations_pkey",
ADD CONSTRAINT "blob_storage_integrations_pkey" PRIMARY KEY ("id");

CREATE INDEX IF NOT EXISTS "blob_storage_integrations_project_id_idx"
ON "blob_storage_integrations"("project_id");
