-- CreateEnum
CREATE TYPE "BlobStorageIntegrationType" AS ENUM ('S3', 'S3_COMPATIBLE', 'AZURE_BLOB_STORAGE');

-- CreateTable
CREATE TABLE "blob_storage_integrations" (
    "project_id" TEXT NOT NULL,
    "type" "BlobStorageIntegrationType" NOT NULL,
    "bucket_name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "access_key_id" TEXT NOT NULL,
    "secret_access_key" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "endpoint" TEXT,
    "force_path_style" BOOLEAN NOT NULL,
    "next_sync_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL,
    "export_frequency" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blob_storage_integrations_pkey" PRIMARY KEY ("project_id")
);

-- AddForeignKey
ALTER TABLE "blob_storage_integrations" ADD CONSTRAINT "blob_storage_integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
