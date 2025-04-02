-- CreateEnum
CREATE TYPE "BlobStorageIntegrationFileType" AS ENUM ('JSON', 'CSV', 'JSONL');

-- AlterTable
ALTER TABLE "blob_storage_integrations" ADD COLUMN     "file_type" "BlobStorageIntegrationFileType" NOT NULL DEFAULT 'CSV';
