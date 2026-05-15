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
  AnalyticsIntegrationExportSource,
  type ObservationFieldGroupFull,
  LangfuseNotFoundError,
  UnauthorizedError,
  ForbiddenError,
  isLegacyBlobExportAllowed,
} from "@langfuse/shared";
import { upsertBlobStorageIntegration } from "@/src/features/blobstorage-integration/service";
import { assertLegacyBlobExportSourceAllowed } from "@/src/features/blobstorage-integration/server/assertLegacyBlobExportSourceAllowed";
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
        integration.exportSource ===
        AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS
          ? null
          : (integration.exportFieldGroups as ObservationFieldGroupFull[]),
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

  if (validatedData.exportSource) {
    assertLegacyBlobExportSourceAllowed({
      project,
      nextInternalExportSource: toInternalExportSource(
        validatedData.exportSource,
      ),
      isCloud,
    });
  }

  // Detect CREATE vs UPDATE so we can apply the correct default when
  // exportSource is omitted.
  const existingIntegration = await prisma.blobStorageIntegration.findUnique({
    where: { projectId: validatedData.projectId },
    select: { projectId: true },
  });
  const isCreate = existingIntegration === null;

  // On UPDATE with no exportSource the existing value is preserved (pass
  // undefined so the upsert leaves the column alone). On CREATE, post-cutoff
  // Cloud projects must not fall back to the Prisma column default
  // (TRACES_OBSERVATIONS — a legacy source); force EVENTS instead.
  const exportSourceInternal =
    validatedData.exportSource != null
      ? toInternalExportSource(validatedData.exportSource)
      : isCreate && !isLegacyBlobExportAllowed(project.createdAt, isCloud)
        ? AnalyticsIntegrationExportSource.EVENTS
        : undefined;

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
      exportSource: exportSourceInternal,
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
      integration.exportSource ===
      AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS
        ? null
        : (integration.exportFieldGroups as ObservationFieldGroupFull[]),
    nextSyncAt: integration.nextSyncAt,
    lastSyncAt: integration.lastSyncAt,
    lastError: integration.lastError,
    lastErrorAt: integration.lastErrorAt,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };

  return res.status(200).json(responseData);
}
