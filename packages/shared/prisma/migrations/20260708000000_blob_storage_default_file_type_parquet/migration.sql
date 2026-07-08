-- Make Parquet the default export file type for new blob storage integrations.
ALTER TABLE "blob_storage_integrations" ALTER COLUMN "file_type" SET DEFAULT 'PARQUET';
