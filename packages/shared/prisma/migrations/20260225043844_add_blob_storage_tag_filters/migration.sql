-- AlterTable
ALTER TABLE "blob_storage_integrations" ADD COLUMN     "tag_filters" JSONB NOT NULL DEFAULT '[]';
