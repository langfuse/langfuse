-- AlterTable
ALTER TABLE "blob_storage_integrations" ADD COLUMN     "export_events" BOOLEAN,
ADD COLUMN     "export_observations" BOOLEAN,
ADD COLUMN     "export_scores" BOOLEAN,
ADD COLUMN     "export_traces" BOOLEAN;
