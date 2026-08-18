import {
  AnalyticsIntegrationExportSource,
  areEnrichedWritesActive,
  areLegacyWritesActive,
  InvalidRequestError,
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
): ExportSourceContext {
  return { ...deployment, projectCreatedAt };
}

/**
 * Validates the requested source (throwing InvalidRequestError when blocked)
 * and returns the value the upsert's CREATE branch should carry.
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
  const createDefaultExportSource = deployment.legacyWritesActive
    ? AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS
    : AnalyticsIntegrationExportSource.EVENTS;

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
    ctx: buildContext(deployment, projectCreatedAt),
  });

  return createDefaultExportSource;
}

/**
 * In-transaction backstop (mirrors blob storage's service.ts). The pre-flight
 * read is racy: a concurrent delete can flip the expected UPDATE into a CREATE
 * carrying the unvalidated legacy default. A changed createdAt detects that,
 * and the row is then re-validated as an explicit choice.
 */
export async function assertRacedCreateAllowed({
  tx,
  projectId,
  requestedExportSource,
  existingIntegration,
  result,
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
  requestedExportSource: AnalyticsIntegrationExportSource | undefined;
  existingIntegration: ExistingAnalyticsIntegration | null | undefined;
  result: ExistingAnalyticsIntegration;
}): Promise<void> {
  if (
    requestedExportSource !== undefined ||
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
    buildContext(readDeployment(), project.createdAt),
  );
  if (!validation.ok) throw new InvalidRequestError(validation.message);
}
