import {
  CloudConfigSchema,
  hasEntitlementBasedOnPlan,
  mapStripeProductIdToPlan,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  BlobStorageIntegrationProcessingQueue,
  QueueJobs,
  getOrganizationPlanServerSide,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import {
  recordExportStaleness,
  windowClassFromBlobFrequency,
} from "../../services/exportStalenessMetric";
import { notifyBlobStorageExportFailed } from "./terminalExportError";
import { BLOB_INTEGRATION_DISABLED_METRIC } from "./isCustomerFaultError";
import { PLAN_DISABLED_ERROR } from "./planDisable";

let legacyJobsDrained = false;

// An unknown plan keeps exporting: disabling a paying customer's export over a
// config we cannot read is worse than one more run. Unknown covers a cloudConfig
// that fails to parse, a ClickHouse Billing plan code dropped as unrecognized,
// and a Stripe product id missing from the product map. The plan resolver maps
// the last two to the free tier. A ClickHouse Billing org with an attached
// plan but no plan code is unknown too; one without either (cancelled or never
// subscribed) is a known free-tier org.
const isPlanUnknown = (cloudConfig: unknown): boolean => {
  const parsed = CloudConfigSchema.safeParse(cloudConfig ?? {});
  if (!parsed.success) return true;
  const config = parsed.data;
  if (config.plan) return false;
  if (config.clickhouse?.organizationId) {
    const rawPlanCode = (
      cloudConfig as { clickhouse?: { planCode?: unknown } } | null
    )?.clickhouse?.planCode;
    return (
      !config.clickhouse.planCode &&
      (rawPlanCode != null || Boolean(config.clickhouse.attachedPlanId))
    );
  }
  const productId = config.stripe?.activeProductId;
  return productId ? !mapStripeProductIdToPlan(productId) : false;
};

const isEntitledToScheduledExports = (
  projectId: string,
  cloudConfig: unknown,
): boolean => {
  if (isPlanUnknown(cloudConfig)) {
    logger.warn(
      `[BLOB INTEGRATION] Unknown plan for project ${projectId}; skipping plan check`,
    );
    return true;
  }
  return hasEntitlementBasedOnPlan({
    plan: getOrganizationPlanServerSide(
      CloudConfigSchema.parse(cloudConfig ?? {}),
    ),
    entitlement: "scheduled-blob-exports",
  });
};

// The enabled true→false claim makes the metric and notification exactly-once
// when ticks overlap or a user toggles the integration concurrently.
const disableForMissingEntitlement = async (projectId: string) => {
  // The tick's plan snapshot can be stale by now (earlier disables wait on
  // notifications); an org that upgraded meanwhile keeps its export.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { organization: { select: { cloudConfig: true } } },
  });
  if (
    !project ||
    isEntitledToScheduledExports(projectId, project.organization.cloudConfig)
  )
    return;

  const { count } = await prisma.blobStorageIntegration.updateMany({
    where: { projectId, enabled: true },
    data: {
      enabled: false,
      lastError: PLAN_DISABLED_ERROR,
      lastErrorAt: new Date(),
    },
  });
  if (count !== 1) return;

  recordIncrement(BLOB_INTEGRATION_DISABLED_METRIC, 1, { reason: "plan" });
  logger.warn(
    `[BLOB INTEGRATION] Disabled blob storage integration for project ${projectId}: plan no longer includes scheduled exports`,
    { blobStorageDisableReason: "plan", projectId },
  );
  await notifyBlobStorageExportFailed(projectId, {
    disabledMessage: (projectName) =>
      `The blob storage export for project "${projectName}" has been disabled because your organization's plan no longer includes scheduled blob storage exports. To resume exporting, upgrade the plan and re-enable the export in the integration settings. You can also delete the integration there.`,
  });
};

// Returns the integrations whose plan includes scheduled exports and disables
// the rest. A failed disable is logged and leaves that integration out.
const disableUnentitledIntegrations = async <
  T extends {
    projectId: string;
    project: { organization: { cloudConfig: unknown } };
  },
>(
  integrations: T[],
): Promise<T[]> => {
  const entitled: T[] = [];
  for (const integration of integrations) {
    if (
      isEntitledToScheduledExports(
        integration.projectId,
        integration.project.organization.cloudConfig,
      )
    ) {
      entitled.push(integration);
      continue;
    }
    try {
      await disableForMissingEntitlement(integration.projectId);
    } catch (error) {
      logger.error(
        `[BLOB INTEGRATION] Failed to disable blob storage integration for project ${integration.projectId} after a plan change`,
        error,
      );
    }
  }
  return entitled;
};

export const handleBlobStorageIntegrationSchedule = async () => {
  const now = new Date();

  const allEnabledIntegrations = await prisma.blobStorageIntegration.findMany({
    select: {
      lastSyncAt: true,
      backfill: true,
      nextSyncAt: true,
      exportFrequency: true,
      projectId: true,
      project: {
        select: { organization: { select: { cloudConfig: true } } },
      },
    },
    where: {
      enabled: true,
    },
  });

  const enabledIntegrations = await disableUnentitledIntegrations(
    allEnabledIntegrations,
  );

  recordExportStaleness({
    integration: "blob_storage",
    now,
    integrations: enabledIntegrations.map((integration) => ({
      lastSyncAt: integration.lastSyncAt,
      window: windowClassFromBlobFrequency(integration.exportFrequency),
      backfill: integration.backfill,
    })),
  });

  const blobStorageIntegrationProjects = enabledIntegrations.filter(
    (integration) =>
      integration.lastSyncAt === null ||
      (integration.nextSyncAt !== null && integration.nextSyncAt <= now),
  );

  if (blobStorageIntegrationProjects.length === 0) {
    logger.info("No blob storage integrations ready for sync");
    return;
  }

  const blobStorageIntegrationProcessingQueue =
    BlobStorageIntegrationProcessingQueue.getInstance();
  if (!blobStorageIntegrationProcessingQueue) {
    throw new Error("BlobStorageIntegrationProcessingQueue not initialized");
  }

  logger.info(
    `Scheduling ${blobStorageIntegrationProjects.length} blob storage integrations for sync`,
  );

  if (!legacyJobsDrained) {
    // One-time cleanup: remove failed jobs left over from before the
    // removeOnFail: true fix. These jobs block re-queuing due to jobId
    // deduplication.
    await blobStorageIntegrationProcessingQueue.clean(0, 0, "failed");
    legacyJobsDrained = true;
    logger.info(
      "[BLOB INTEGRATION] Drained legacy failed jobs from processing queue",
    );
  }

  await blobStorageIntegrationProcessingQueue.addBulk(
    blobStorageIntegrationProjects.map((integration) => ({
      name: QueueJobs.BlobStorageIntegrationProcessingJob,
      data: {
        id: randomUUID(),
        name: QueueJobs.BlobStorageIntegrationProcessingJob,
        timestamp: new Date(),
        payload: {
          projectId: integration.projectId,
        },
      },
      opts: {
        // Deduplicate by projectId + lastSyncAt so the same project isn't queued
        // twice for the same sync window. removeOnFail ensures failed jobs are
        // immediately cleaned up so they don't block re-queuing on the next cycle.
        jobId: `${integration.projectId}-${integration.lastSyncAt?.toISOString() ?? ""}`,
        removeOnFail: true,
      },
    })),
  );
};
