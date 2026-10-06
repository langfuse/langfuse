CREATE TYPE "ExternalMediaStorageIntegrationType" AS ENUM (
    'S3',
    'S3_COMPATIBLE'
);

CREATE TABLE "external_media_storage_integrations" (
    "project_id" TEXT NOT NULL,
    "type" "ExternalMediaStorageIntegrationType" NOT NULL,
    "bucket_name" TEXT NOT NULL,
    "prefix" TEXT,
    "access_key_id" TEXT,
    "secret_access_key" TEXT,
    "region" TEXT NOT NULL,
    "endpoint" TEXT,
    "force_path_style" BOOLEAN NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_media_storage_integrations_pkey" PRIMARY KEY ("project_id"),
    CONSTRAINT "external_media_storage_integrations_project_id_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
