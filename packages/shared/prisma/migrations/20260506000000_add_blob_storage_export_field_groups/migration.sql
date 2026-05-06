-- AlterTable
ALTER TABLE IF EXISTS "blob_storage_integrations"
  ADD COLUMN IF NOT EXISTS "export_field_groups" TEXT[]
  NOT NULL DEFAULT ARRAY['core','basic','time','io','metadata','model','usage','prompt','metrics','tools','trace_context'];
