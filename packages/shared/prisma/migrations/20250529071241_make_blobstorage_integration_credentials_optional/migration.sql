-- AlterTable
ALTER TABLE "blob_storage_integrations" ALTER COLUMN "access_key_id" DROP NOT NULL,
ALTER COLUMN "secret_access_key" DROP NOT NULL;
