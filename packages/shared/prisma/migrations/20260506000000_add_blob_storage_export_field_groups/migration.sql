-- AlterTable
ALTER TABLE "blob_storage_integrations"
  ADD COLUMN "export_field_groups" TEXT[]
  NOT NULL DEFAULT ARRAY['core','basic','time','io','metadata','model','usage','prompt','metrics','tools','trace_context'];
