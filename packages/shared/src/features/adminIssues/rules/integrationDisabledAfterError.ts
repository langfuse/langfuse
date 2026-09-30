import { prisma } from "../../../db";
import { buildProjectSettingsPath } from "../../../utils/productUrl";
import type { AdminIssueDefinition, RuleIssue } from "../adminIssueDefinitions";

const MAX_ERROR_LENGTH = 300;

const formatError = (error: string) => {
  const singleLine = error
    .replace(/\s+/g, " ")
    .replaceAll("`", "'")
    .trim()
    .replace(/\.$/, "");
  return singleLine.length > MAX_ERROR_LENGTH
    ? `${singleLine.slice(0, MAX_ERROR_LENGTH)}…`
    : singleLine;
};

/**
 * Workers disable these integrations on configuration faults and clear
 * `lastError` on a successful run, so a disabled integration with a
 * `lastError` stopped exporting because of that error.
 */
export const integrationDisabledAfterErrorRule = {
  id: "integration-disabled-after-error",
  name: "Fix disabled integrations",
  group: "integration",
  ctaLabel: "Configure integration",
  callback: async (projectId) => {
    const where = { projectId, enabled: false, lastError: { not: null } };
    const select = { lastError: true } as const;
    const [blobStorage, posthog] = await Promise.all([
      prisma.blobStorageIntegration.findFirst({ where, select }),
      prisma.posthogIntegration.findFirst({ where, select }),
    ]);

    const issues: RuleIssue[] = [];
    if (blobStorage?.lastError) {
      issues.push({
        description: `Blob storage export is disabled after the last export failed with \`${formatError(blobStorage.lastError)}\`. Fix the bucket configuration or credentials and re-enable the integration. [Learn more](https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage).`,
        priority: 1,
        ctaLink: buildProjectSettingsPath({
          projectId,
          page: "integrations/blobstorage",
        }),
      });
    }
    if (posthog?.lastError) {
      issues.push({
        description: `PostHog export is disabled after the last export failed with \`${formatError(posthog.lastError)}\`. Fix the PostHog host or API key and re-enable the integration. [Learn more](https://langfuse.com/integrations/analytics/posthog).`,
        priority: 1,
        ctaLink: buildProjectSettingsPath({
          projectId,
          page: "integrations/posthog",
        }),
      });
    }
    return issues;
  },
} as const satisfies AdminIssueDefinition;
