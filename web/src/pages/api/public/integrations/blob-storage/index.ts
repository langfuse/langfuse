import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import {
  CreateBlobStorageIntegrationRequest,
  toInternalExportSource,
  toPublicExportSource,
  type BlobStorageIntegrationResponseType,
} from "@/src/features/public-api/types/blob-storage-integrations";
import {
  type ObservationFieldGroupFull,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { upsertBlobStorageIntegration } from "@/src/features/blobstorage-integration/service";
import { resolveExportSource } from "@/src/features/analytics-integrations/server";
import { auditLog } from "@/src/features/audit-logs/server";
import { authorizeBlobStorageRequest } from "@/src/features/blobstorage-integration/authorizeBlobStorageRequest";

export default withMiddlewares({
  GET: handleGetBlobStorageIntegrations,
  PUT: handleUpsertBlobStorageIntegration,
});

async function handleGetBlobStorageIntegrations(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const scope = await authorizeBlobStorageRequest(req);

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
      id: integration.id,
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
  const scope = await authorizeBlobStorageRequest(req);

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
  const existingIntegration = await prisma.blobStorageIntegration.findFirst({
    where: {
      id: validatedData.projectId,
      projectId: validatedData.projectId,
    },
    select: { id: true, createdAt: true, exportSource: true },
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

  const upsertIntegration = (integrationId?: string) =>
    upsertBlobStorageIntegration({
      prisma,
      projectId: validatedData.projectId,
      integrationId,
      createId: validatedData.projectId,
      createExportSource,
      persistAuditLog: (tx, resourceId) =>
        auditLog(
          {
            action: "update",
            resourceType: "blobStorageIntegration",
            resourceId,
            apiKeyId: scope.apiKeyId,
            orgId: scope.orgId,
          },
          tx,
        ),
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

  let integration: Awaited<ReturnType<typeof upsertIntegration>>;
  try {
    integration = await upsertIntegration(existingIntegration?.id);
  } catch (error) {
    const concurrentCreate =
      !existingIntegration &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";
    if (!concurrentCreate) throw error;
    integration = await upsertIntegration(validatedData.projectId);
  }

  // Transform to API response format, exclude secretAccessKey
  const responseData: BlobStorageIntegrationResponseType = {
    id: integration.id,
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
