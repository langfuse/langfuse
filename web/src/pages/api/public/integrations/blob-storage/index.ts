import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { prisma } from "@langfuse/shared/src/db";
import { type ApiAccessScope } from "@langfuse/shared/src/server";
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
} from "@langfuse/shared";
import { upsertBlobStorageIntegration } from "@/src/features/blobstorage-integration/service";
import { resolveExportSource } from "@/src/features/analytics-integrations/server/exportSource";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { verifyOrgAuth } from "@/src/features/auth/policy/shadow.direct";

/** orgKeyRequired is the 403 body when a non-organization key hits a blob-storage endpoint. */
const orgKeyRequired =
  "Organization-scoped API key required for this operation.";

export default withMiddlewares({
  GET: handleGetBlobStorageIntegrations,
  PUT: handleUpsertBlobStorageIntegration,
});

async function handleGetBlobStorageIntegrations(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const scope = await authorizeBlobStorageRequest(
    req,
    "List Blob Storage Integrations",
  );

  // Get all projects for the organization
  const projects = await prisma.project.findMany({
    where: { orgId: scope.orgId },
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
  const scope = await authorizeBlobStorageRequest(
    req,
    "Upsert Blob Storage Integration",
  );

  // Validate request body
  const validatedData = CreateBlobStorageIntegrationRequest.parse(req.body);

  // Check if the project exists and belongs to the organization
  const project = await prisma.project.findUnique({
    where: { id: validatedData.projectId },
    select: { id: true, orgId: true, createdAt: true },
  });
  if (!project || project.orgId !== scope.orgId) {
    throw new LangfuseNotFoundError("Project not found");
  }

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
    select: { createdAt: true, exportSource: true },
  });

  // Explicit sources must pass every check; an omitted source keeps the
  // persisted one, capability-checked only, and a create falls back to the
  // shared default. Same call the tRPC routers make, so a PUT and a settings
  // save agree. See export-source-policy.ts.
  const createExportSource = await resolveExportSource({
    db: prisma,
    projectId: validatedData.projectId,
    // Already loaded above for the org-ownership check; reuse it rather than
    // making the helper re-read the same row.
    projectCreatedAt: project.createdAt,
    requestedExportSource: internalExportSource,
    existingIntegration,
  });

  await auditLog({
    action: "update",
    resourceType: "blobStorageIntegration",
    resourceId: validatedData.projectId,
    apiKeyId: scope.apiKeyId,
    orgId: scope.orgId,
  });

  const integration = await upsertBlobStorageIntegration({
    prisma,
    projectId: validatedData.projectId,
    createExportSource,
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

/** authorizeBlobStorageRequest gates a blob-storage request on an organization key and the scheduled-blob-exports entitlement, returning the verified scope. */
async function authorizeBlobStorageRequest(
  req: NextApiRequest,
  name: string,
): Promise<ApiAccessScope> {
  const authCheck = await verifyOrgAuth({
    req,
    name,
    action: "projects:read",
    scopeDeniedMessage: orgKeyRequired,
  });
  if (!authCheck.validKey) {
    if (authCheck.status === 401) {
      throw new UnauthorizedError(authCheck.error);
    }
    throw new ForbiddenError(authCheck.error);
  }
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
  return authCheck.scope;
}
