import {
  AnalyticsIntegrationExportSource,
  areEnrichedWritesActive,
  areLegacyWritesActive,
  InvalidRequestError,
  LEGACY_ANALYTICS_EXPORTER_CUTOFF,
  validateExportSource,
  type ExportSourceContext,
} from "@langfuse/shared";
import { type Prisma } from "@langfuse/shared/src/db";

import { env } from "@/src/env.mjs";
import { assertExportSourceAllowed } from "@/src/features/analytics-integrations/server/assertExportSourceAllowed";

/**
 * Write-time export-source handling for the PostHog and Mixpanel routers, whose
 * upserts are otherwise identical here. Assembles the ExportSourceContext both
 * routers need — see export-source-policy.ts for the policy itself.
 */

type ExistingAnalyticsIntegration = {
  exportSource: AnalyticsIntegrationExportSource;
  createdAt: Date;
};

type Deployment = {
  isCloud: boolean;
  enrichedAvailable: boolean;
  legacyWritesActive: boolean;
};

function readDeployment(): Deployment {
  const writeMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
  return {
    isCloud: Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION),
    enrichedAvailable: areEnrichedWritesActive(writeMode),
    legacyWritesActive: areLegacyWritesActive(writeMode),
  };
}

function buildContext(
  deployment: Deployment,
  projectCreatedAt: Date | undefined,
  integrationCreatedAt: Date | null,
): ExportSourceContext {
  return {
    ...deployment,
    projectCreatedAt,
    integrationCreatedAt,
    exporterCutoff: LEGACY_ANALYTICS_EXPORTER_CUTOFF,
  };
}

/**
 * Validates the requested source (throwing InvalidRequestError when blocked)
 * and returns the value the upsert's CREATE branch should carry.
 *
 * That value prefers the persisted source over the new-row default, because a
 * concurrent delete can turn the upsert into a CREATE that was meant as an
 * UPDATE; assertRacedCreateAllowed then judges whatever landed.
 */
export async function resolveAnalyticsExportSource({
  db,
  projectId,
  requestedExportSource,
  existingIntegration,
}: {
  db: Prisma.TransactionClient;
  projectId: string;
  requestedExportSource: AnalyticsIntegrationExportSource | undefined;
  existingIntegration: ExistingAnalyticsIntegration | null | undefined;
}): Promise<AnalyticsIntegrationExportSource> {
  const deployment = readDeployment();
  // On Cloud a new row is pinned to enriched events regardless of write mode:
  // the legacy source is not available to it, so defaulting to it would only
  // produce a rejection.
  const createDefaultExportSource =
    deployment.isCloud || !deployment.legacyWritesActive
      ? AnalyticsIntegrationExportSource.EVENTS
      : AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS;

  const nextExportSource =
    requestedExportSource ??
    (existingIntegration ? undefined : createDefaultExportSource);
  // The Cloud cutoffs need the project only for explicitly chosen (or
  // create-defaulted) sources.
  const projectCreatedAt = nextExportSource
    ? (
        await db.project.findUniqueOrThrow({
          where: { id: projectId },
          select: { createdAt: true },
        })
      ).createdAt
    : undefined;

  assertExportSourceAllowed({
    nextExportSource,
    persistedExportSource: existingIntegration?.exportSource,
    ctx: buildContext(
      deployment,
      projectCreatedAt,
      existingIntegration?.createdAt ?? null,
    ),
  });

  return (
    requestedExportSource ??
    existingIntegration?.exportSource ??
    createDefaultExportSource
  );
}

/**
 * In-transaction backstop (mirrors blob storage's service.ts). The pre-flight
 * read is racy: a concurrent delete can flip the expected UPDATE into a CREATE.
 * A changed createdAt detects that, and the row is then re-validated as the
 * brand-new row it is — not as the grandfathered one the pre-flight read saw.
 *
 * This runs whether or not the request named a source. An explicit source is
 * validated up front against the *existing* row's age, so a raced create leaves
 * it judged by the wrong row: the pre-flight read grandfathered an old row that
 * no longer exists.
 */
export async function assertRacedCreateAllowed({
  tx,
  projectId,
  existingIntegration,
  result,
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
  existingIntegration: ExistingAnalyticsIntegration | null | undefined;
  result: ExistingAnalyticsIntegration;
}): Promise<void> {
  if (
    !existingIntegration ||
    result.createdAt.getTime() === existingIntegration.createdAt.getTime()
  ) {
    return;
  }
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { createdAt: true },
  });
  const validation = validateExportSource(
    result.exportSource,
    buildContext(readDeployment(), project.createdAt, null),
  );
  if (!validation.ok) throw new InvalidRequestError(validation.message);
}
