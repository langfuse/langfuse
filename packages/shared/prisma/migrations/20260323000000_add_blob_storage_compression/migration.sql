-- AlterTable
-- Backfill existing columns with value false, but use true as the default for newly created rows.
ALTER TABLE "blob_storage_integrations" ADD COLUMN "compressed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "blob_storage_integrations" ALTER COLUMN "compressed" SET DEFAULT true;
