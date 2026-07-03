import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import { type NextApiRequest, type NextApiResponse } from "next";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import {
  CreateBlobStorageIntegrationRequest,
  toInternalExportSource,
  toPublicExportSource,
  type BlobStorageIntegrationResponseType,
} from "@/src/features/public-api/types/blob-storage-integrations";
import {
  type ObservationFieldGroupFull,
  BlobStorageIntegrationFileType,
  InvalidRequestError,
  LangfuseNotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from "@langfuse/shared";
import { upsertBlobStorageIntegration } from "@/src/features/blobstorage-integration/service";
import { assertLegacyBlobExportSourceAllowedForUpsert } from "@/src/features/blobstorage-integration/server/assertLegacyBlobExportSourceAllowedForUpsert";
import { assertEnrichedBlobExportSourceAllowed } from "@/src/features/blobstorage-integration/server/assertEnrichedBlobExportSourceAllowed";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { env } from "@/src/env.mjs";

export default withMiddlewares({
  GET: handleGetBlobStorageIntegrations,
  PUT: handleUpsertBlobStorageIntegration,
});

async function handleGetBlobStorageIntegrations(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // CHECK AUTH
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    throw new UnauthorizedError(authCheck.error ?? "Unauthorized");
  }

  // Check if using an organization API key
  if (
    authCheck.scope.accessLevel !== "organization" ||
    !authCheck.scope.orgId
  ) {
    throw new ForbiddenError(
      "Organization-scoped API key required for this operation.",
    );
  }

  // Check scheduled-blob-exports entitlement
  if (
    !hasEntitlementBasedOnPlan({
      plan: authCheck.scope.plan,
      entitlement: "scheduled-blob-exports",
    })
  ) {
    throw new ForbiddenError(
      "scheduled-blob-exports entitlement required for this feature.",
    );
  }

  // Get all projects for the organization
  const projects = await prisma.project.findMany({
    where: { orgId: authCheck.scope.orgId },
    select: { id: true },
  });

  // Get all blob storage integrations for these projects
  const integrations = await prisma.blobStorageIntegration.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
    },
  });

  // Transform to API response format, exclude secretAccessKey
  const responseData: BlobStorageIntegrationResponseType[] = integrations.map(
    (integration) => ({
      id: integration.projectId, // Using projectId as ID since it's the primary key
      projectId: integration.projectId,
      type: integration.type,
      bucketName: integration.bucketName,
      endpoint: integration.endpoint,
      region: integration.region,
      accessKeyId: integration.accessKeyId,
      prefix: integration.prefix,
      exportFrequency: integration.exportFrequency,
      enabled: integration.enabled,
      forcePathStyle: integration.forcePathStyle,
      fileType: integration.fileType,
      exportMode: integration.exportMode,
      exportStartDate: integration.exportStartDate,
      compressed: integration.compressed,
      exportSource: toPublicExportSource(integration.exportSource),
      exportFieldGroups:
        integration.exportFieldGroups as ObservationFieldGroupFull[],
      nextSyncAt: integration.nextSyncAt,
      lastSyncAt: integration.lastSyncAt,
      lastError: integration.lastError,
      lastErrorAt: integration.lastErrorAt,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    }),
  );

  return res.status(200).json({
    data: responseData,
  });
}

async function handleUpsertBlobStorageIntegration(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // CHECK AUTH
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization);
  if (!authCheck.validKey) {
    throw new UnauthorizedError(authCheck.error ?? "Unauthorized");
  }

  // Check if using an organization API key
  if (
    authCheck.scope.accessLevel !== "organization" ||
    !authCheck.scope.orgId
  ) {
    throw new ForbiddenError(
      "Organization-scoped API key required for this operation.",
    );
  }

  // Check scheduled-blob-exports entitlement
  if (
    !hasEntitlementBasedOnPlan({
      plan: authCheck.scope.plan,
      entitlement: "scheduled-blob-exports",
    })
  ) {
    throw new ForbiddenError(
      "scheduled-blob-exports entitlement required for this feature.",
    );
  }

  // Validate request body
  const validatedData = CreateBlobStorageIntegrationRequest.parse(req.body);

  // Check if the project exists and belongs to the organization
  const project = await prisma.project.findUnique({
    where: { id: validatedData.projectId },
    select: { id: true, orgId: true, createdAt: true },
  });
  if (!project || project.orgId !== authCheck.scope.orgId) {
    throw new LangfuseNotFoundError("Project not found");
  }

  const isCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

  const isV4PreviewEnabled =
    env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true";
  const internalExportSource =
    validatedData.exportSource != null
      ? toInternalExportSource(validatedData.exportSource)
      : undefined;

  // Feeds both write-time gates: the legacy upsert gate needs the row's
  // createdAt when exportSource is provided; the enriched gate needs the
  // persisted exportSource when it is omitted (partial PUT), so a stale
  // enriched value is rejected.
  const existingIntegration = await prisma.blobStorageIntegration.findUnique({
    where: { projectId: validatedData.projectId },
    select: { createdAt: true, exportSource: true, fileType: true },
  });

  // PARQUET cannot be set via the REST API yet (request enum omits it). Block
  // any PUT that would silently downgrade a Parquet integration to a text format.
  // Written as a downgrade check (existing === PARQUET && request !== PARQUET) so
  // it automatically narrows to no-op once PARQUET is added to the request enum at GA.
  const requestFileType: string = validatedData.fileType;
  if (
    existingIntegration?.fileType === BlobStorageIntegrationFileType.PARQUET &&
    requestFileType !== BlobStorageIntegrationFileType.PARQUET
  ) {
    throw new InvalidRequestError(
      "Integrations exporting Parquet must be managed through the Langfuse UI; the public API cannot modify them while Parquet is in stabilisation.",
    );
  }

  if (internalExportSource) {
    assertLegacyBlobExportSourceAllowedForUpsert({
      project,
      existingIntegration,
      nextInternalExportSource: internalExportSource,
      isCloud,
    });
  }

  assertEnrichedBlobExportSourceAllowed({
    nextInternalExportSource: internalExportSource,
    existingExportSource: existingIntegration?.exportSource,
    isCloud,
    isV4PreviewEnabled,
  });

  await auditLog({
    action: "update",
    resourceType: "blobStorageIntegration",
    resourceId: validatedData.projectId,
    apiKeyId: authCheck.scope.apiKeyId,
    orgId: authCheck.scope.orgId,
  });

  const integration = await upsertBlobStorageIntegration({
    prisma,
    projectId: validatedData.projectId,
    // New Cloud rows default to EVENTS when exportSource is omitted: a
    // brand-new row is post-cutoff, so the legacy column default would trip
    // refuseLegacyOnCreate and fail a partial PUT that never mentioned
    // exportSource. Substituted in-transaction to avoid a TOCTOU window.
    forceEventsOnCreate: validatedData.exportSource == null && isCloud,
    // In-transaction backstop: a concurrent DELETE can flip this upsert to
    // CREATE; never let a new Cloud row be born with a legacy source.
    refuseLegacyOnCreate: isCloud,
    data: {
      type: validatedData.type,
      bucketName: validatedData.bucketName,
      endpoint: validatedData.endpoint || null,
      region: validatedData.region,
      accessKeyId: validatedData.accessKeyId || null,
      secretAccessKey: validatedData.secretAccessKey ?? null,
      prefix: validatedData.prefix,
      exportFrequency: validatedData.exportFrequency,
      enabled: validatedData.enabled,
      forcePathStyle: validatedData.forcePathStyle,
      fileType: validatedData.fileType,
      exportMode: validatedData.exportMode,
      exportStartDate: validatedData.exportStartDate ?? null,
      compressed: validatedData.compressed,
      exportSource: internalExportSource,
      exportFieldGroups: validatedData.exportFieldGroups ?? undefined,
    },
  });

  // Transform to API response format, exclude secretAccessKey
  const responseData: BlobStorageIntegrationResponseType = {
    id: integration.projectId, // Using projectId as ID since it's the primary key
    projectId: integration.projectId,
    type: integration.type,
    bucketName: integration.bucketName,
    endpoint: integration.endpoint,
    region: integration.region,
    accessKeyId: integration.accessKeyId,
    prefix: integration.prefix,
    exportFrequency: integration.exportFrequency,
    enabled: integration.enabled,
    forcePathStyle: integration.forcePathStyle,
    fileType: integration.fileType,
    exportMode: integration.exportMode,
    exportStartDate: integration.exportStartDate,
    compressed: integration.compressed,
    exportSource: toPublicExportSource(integration.exportSource),
    exportFieldGroups:
      integration.exportFieldGroups as ObservationFieldGroupFull[],
    nextSyncAt: integration.nextSyncAt,
    lastSyncAt: integration.lastSyncAt,
    lastError: integration.lastError,
    lastErrorAt: integration.lastErrorAt,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };

  return res.status(200).json(responseData);
}
