-- AlterTable
ALTER TABLE "blob_storage_integrations" ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "progress_state" JSONB;
