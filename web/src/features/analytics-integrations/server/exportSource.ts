import {
  type AnalyticsIntegrationExportSource,
  areEnrichedWritesActive,
  areLegacyWritesActive,
  defaultExportSource,
  InvalidRequestError,
  validateExportSource,
  type ExportSourceContext,
} from "@langfuse/shared";
import { type Prisma } from "@langfuse/shared/src/db";

import { env } from "@/src/env.mjs";
import { assertExportSourceAllowed } from "@/src/features/analytics-integrations/server/assertExportSourceAllowed";

/**
 * Write-time export-source handling shared by every integration family's upsert
 * (blob storage, PostHog, Mixpanel). Assembles the ExportSourceContext they all
 * need from server env — see export-source-policy.ts for the policy itself.
 *
 * Each family passes its own `exporterCutoff`; omitting it falls back to the
 * blob date, matching the policy default.
 */

type ExistingIntegration = {
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
  exporterCutoff: Date | undefined,
): ExportSourceContext {
  return {
    ...deployment,
    projectCreatedAt,
    integrationCreatedAt,
    exporterCutoff,
  };
}

/**
 * Validates the requested source (throwing InvalidRequestError when blocked)
 * and returns the value the upsert's CREATE branch should carry. That value
 * prefers the persisted source, because a concurrent delete can turn an upsert
 * meant as an UPDATE into a CREATE; assertPersistedExportSourceAllowed judges
 * what actually lands.
 *
 * The returned value is always concrete, never undefined, so the CREATE payload
 * can never fall through to the legacy Prisma column default.
 *
 * Callers that already hold the project row (the public REST handler loads it
 * for its org-ownership check) pass `projectCreatedAt` to skip the lookup below.
 * The tRPC routers have no project in scope and omit it.
 */
export async function resolveExportSource({
  db,
  projectId,
  projectCreatedAt: prefetchedProjectCreatedAt,
  requestedExportSource,
  existingIntegration,
  exporterCutoff,
}: {
  db: Prisma.TransactionClient;
  projectId: string;
  projectCreatedAt?: Date;
  requestedExportSource: AnalyticsIntegrationExportSource | undefined;
  existingIntegration: ExistingIntegration | null | undefined;
  exporterCutoff?: Date;
}): Promise<AnalyticsIntegrationExportSource> {
  const deployment = readDeployment();

  // The Cloud cutoffs need the project only when this call chooses a source —
  // an explicit request, or the create default for a row that does not exist
  // yet. A partial update that keeps the persisted value needs no project date
  // at all, so it stays undefined even when the caller prefetched one: that is
  // what lets the cutoffs grandfather a persisted legacy value.
  const choosesSource =
    requestedExportSource !== undefined || !existingIntegration;
  const projectCreatedAt = !choosesSource
    ? undefined
    : (prefetchedProjectCreatedAt ??
      (
        await db.project.findUniqueOrThrow({
          where: { id: projectId },
          select: { createdAt: true },
        })
      ).createdAt);

  // The create default is judged by new-integration rules, hence the null
  // integrationCreatedAt: the Cloud cutoffs must not grandfather a row that
  // does not exist yet.
  const createDefault = defaultExportSource(
    buildContext(deployment, projectCreatedAt, null, exporterCutoff),
  );

  assertExportSourceAllowed({
    nextExportSource:
      requestedExportSource ??
      (existingIntegration ? undefined : createDefault),
    persistedExportSource: existingIntegration?.exportSource,
    ctx: buildContext(
      deployment,
      projectCreatedAt,
      existingIntegration?.createdAt ?? null,
      exporterCutoff,
    ),
  });

  return (
    requestedExportSource ?? existingIntegration?.exportSource ?? createDefault
  );
}

/**
 * In-transaction backstop over the row that actually landed. The pre-flight read
 * is racy under READ COMMITTED: a concurrent delete can flip the expected UPDATE
 * into a CREATE, and a concurrent create can flip the expected CREATE into an
 * UPDATE. Validating `result` closes both windows, and it runs unconditionally
 * so no path escapes the check.
 *
 * `result.createdAt` alone is not enough to decide how strictly to judge the
 * row: while a family's exporter cutoff is still in the future, a row created
 * *now* is still before the cutoff and would be grandfathered by date, defeating
 * the rule that a brand-new Cloud integration never gets a legacy source. So a
 * row this transaction created is passed as null (new-integration rules) and
 * only a row that predates the transaction is judged by its own date.
 *
 * projectCreatedAt is deliberately omitted: the project-level cutoff gates newly
 * chosen values, and applying it here would reject grandfathered rows on every
 * partial update. A raced create is still caught, because a new row on Cloud
 * fails the integration-level check above.
 */
export function assertPersistedExportSourceAllowed({
  existingIntegration,
  result,
  exporterCutoff,
}: {
  existingIntegration: ExistingIntegration | null | undefined;
  result: ExistingIntegration;
  exporterCutoff?: Date;
}): void {
  const createdByThisTransaction =
    !existingIntegration ||
    result.createdAt.getTime() !== existingIntegration.createdAt.getTime();

  const validation = validateExportSource(
    result.exportSource,
    buildContext(
      readDeployment(),
      undefined,
      createdByThisTransaction ? null : result.createdAt,
      exporterCutoff,
    ),
  );
  if (!validation.ok) throw new InvalidRequestError(validation.message);
}
