-- CreateEnum
CREATE TYPE "BlobStorageExportMode" AS ENUM ('FULL_HISTORY', 'FROM_TODAY', 'FROM_CUSTOM_DATE');

-- AlterTable
ALTER TABLE "blob_storage_integrations" ADD COLUMN     "export_mode" "BlobStorageExportMode" NOT NULL DEFAULT 'FULL_HISTORY',
ADD COLUMN     "export_start_date" TIMESTAMP(3);
