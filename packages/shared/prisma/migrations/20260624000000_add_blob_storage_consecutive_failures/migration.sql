-- AlterTable
ALTER TABLE "blob_storage_integrations" ADD COLUMN "consecutive_failures" INTEGER NOT NULL DEFAULT 0;
