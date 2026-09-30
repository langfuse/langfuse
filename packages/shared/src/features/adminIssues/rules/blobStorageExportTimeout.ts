import { prisma } from "../../../db";
import { buildProjectSettingsPath } from "../../../utils/productUrl";
import type { AdminIssueDefinition } from "../adminIssueDefinitions";

const CLICKHOUSE_TIMEOUT_PATTERN = /TIMEOUT_EXCEEDED|\bCode: 159\b/;

export const blobStorageExportTimeoutRule = {
  id: "blob-storage-export-timeout",
  name: "Export blob storage as Parquet",
  group: "integration",
  ctaLabel: "Configure export",
  callback: async (projectId) => {
    const integration = await prisma.blobStorageIntegration.findUnique({
      where: { projectId },
      select: { fileType: true, lastError: true },
    });
    if (
      !integration?.lastError ||
      integration.fileType === "PARQUET" ||
      !CLICKHOUSE_TIMEOUT_PATTERN.test(integration.lastError)
    ) {
      return [];
    }

    return [
      {
        description: `The last blob storage export timed out while reading data. Switch the file type from ${integration.fileType} to Parquet, which exports large time windows faster. [Learn more](https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage).`,
        priority: 2,
        ctaLink: buildProjectSettingsPath({
          projectId,
          page: "integrations/blobstorage",
        }),
      },
    ];
  },
} as const satisfies AdminIssueDefinition;
