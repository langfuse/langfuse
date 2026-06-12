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
  LangfuseNotFoundError,
  UnauthorizedError,
  ForbiddenError,
  isEnrichedBlobExportAvailable,
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

  // One read serving both write-time gates (the conditions are disjoint, so at
  // most one query runs):
  // - exportSource provided → the legacy upsert gate needs the row's createdAt
  //   to decide whether the integration is grandfathered for legacy sources.
  // - exportSource omitted (partial PUT) → the persisted value stays in effect,
  //   so the enriched gate must consider the existing row too — otherwise a
  //   stale enriched source left behind by a V4-preview flag rollback keeps
  //   driving the worker against unpopulated tables. Read only when that gate
  //   could actually reject (enriched export unavailable).
  const existingIntegration =
    internalExportSource !== undefined ||
    !isEnrichedBlobExportAvailable(isCloud, isV4PreviewEnabled)
      ? await prisma.blobStorageIntegration.findUnique({
          where: { projectId: validatedData.projectId },
          select: { createdAt: true, exportSource: true },
        })
      : null;

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
    // When exportSource is absent, have the service substitute EVENTS on
    // CREATE inside its own transaction (eliminating the TOCTOU window that a
    // pre-flight findUnique would create) for every Cloud project: a brand-new
    // Cloud row counts as a post-cutoff integration, so letting the legacy
    // Prisma column default through would trip refuseLegacyOnCreate and fail a
    // partial PUT that never mentioned exportSource.
    forceEventsOnCreate: validatedData.exportSource == null && isCloud,
    // In-transaction backstop closing the TOCTOU window: if a concurrent
    // DELETE flips this upsert to the CREATE branch, refuse a legacy source so
    // a new (post-cutoff) Cloud row can never be born legacy.
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
