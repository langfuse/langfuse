ALTER TABLE "blob_storage_integrations"
ADD COLUMN "media_prefix" TEXT;

UPDATE "blob_storage_integrations"
SET "media_prefix" = "prefix"
WHERE "media_storage_enabled" = TRUE
  AND "prefix" <> '';
