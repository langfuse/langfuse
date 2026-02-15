-- CreateEnum
CREATE TYPE "AnalyticsIntegrationExportSource" AS ENUM ('TRACES_OBSERVATIONS', 'TRACES_OBSERVATIONS_EVENTS', 'EVENTS');

-- AlterTable
ALTER TABLE "blob_storage_integrations" ADD COLUMN     "export_source" "AnalyticsIntegrationExportSource" NOT NULL DEFAULT 'TRACES_OBSERVATIONS';

-- AlterTable
ALTER TABLE "mixpanel_integrations" ADD COLUMN     "export_source" "AnalyticsIntegrationExportSource" NOT NULL DEFAULT 'TRACES_OBSERVATIONS';

-- AlterTable
ALTER TABLE "posthog_integrations" ADD COLUMN     "export_source" "AnalyticsIntegrationExportSource" NOT NULL DEFAULT 'TRACES_OBSERVATIONS';
