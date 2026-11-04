import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { prisma, type BlobStorageIntegration } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import {
  CreateBlobStorageIntegrationRequest,
  toInternalExportSource,
  toPublicExportFieldGroups,
  toPublicExportSource,
  type BlobStorageIntegrationResponseType,
} from "@/src/features/public-api/types/blob-storage-integrations";
import {
  LangfuseNotFoundError,
  StorageIntegrationAuthType,
  TRACE_EXPORT_FIELD_GROUPS,
  type ExportFieldGroup,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import { getStorageAccessRoleArn } from "@langfuse/shared/src/server";
import { upsertBlobStorageIntegration } from "@/src/features/blobstorage-integration/service";
import { resolveExportSource } from "@/src/features/analytics-integrations/server/exportSource";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { authorizeBlobStorageRequest } from "@/src/features/blobstorage-integration/authorizeBlobStorageRequest";

// Never includes secretAccessKey. The external ID is not a secret: the customer
// needs it for the role's trust policy.
function toBlobStorageIntegrationResponse(
  integration: BlobStorageIntegration,
): BlobStorageIntegrationResponseType {
  return {
    id: integration.projectId, // Using projectId as ID since it's the primary key
    projectId: integration.projectId,
    type: integration.type,
    bucketName: integration.bucketName,
    endpoint: integration.endpoint,
    region: integration.region,
    authType: integration.authType,
    accessKeyId: integration.accessKeyId,
    roleArn: integration.roleArn,
    externalId: integration.externalId ? decrypt(integration.externalId) : null,
    accessRoleArn: getStorageAccessRoleArn(),
    prefix: integration.prefix,
    exportFrequency: integration.exportFrequency,
    enabled: integration.enabled,
    forcePathStyle: integration.forcePathStyle,
    fileType: integration.fileType,
    exportMode: integration.exportMode,
    exportStartDate: integration.exportStartDate,
    compressed: integration.compressed,
    exportSource: toPublicExportSource(integration.exportSource),
    exportFieldGroups: toPublicExportFieldGroups(integration.exportFieldGroups),
    nextSyncAt: integration.nextSyncAt,
    lastSyncAt: integration.lastSyncAt,
    lastError: integration.lastError,
    lastErrorAt: integration.lastErrorAt,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

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

  const responseData = integrations.map(toBlobStorageIntegrationResponse);

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
  const existingIntegration = await prisma.blobStorageIntegration.findUnique({
    where: { projectId: validatedData.projectId },
    select: {
      createdAt: true,
      exportSource: true,
      exportFieldGroups: true,
      authType: true,
      roleArn: true,
    },
  });

  // An omitted authType keeps a stored role unless the request sends access
  // keys, so a GET-then-PUT round trip does not drop IAM role auth.
  const sendsAccessKeys = !!(
    validatedData.accessKeyId || validatedData.secretAccessKey
  );
  const authType =
    validatedData.authType ??
    (existingIntegration?.authType === StorageIntegrationAuthType.ROLE_ARN &&
    !sendsAccessKeys
      ? StorageIntegrationAuthType.ROLE_ARN
      : StorageIntegrationAuthType.ACCESS_KEYS);
  const roleArn =
    authType === StorageIntegrationAuthType.ROLE_ARN
      ? (validatedData.roleArn ?? existingIntegration?.roleArn ?? null)
      : null;

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

  // Trace groups are set in the UI only; keep them when the API replaces the
  // public groups.
  const storedTraceFieldGroups = (
    existingIntegration?.exportFieldGroups ?? []
  ).filter((group): group is ExportFieldGroup =>
    (TRACE_EXPORT_FIELD_GROUPS as readonly string[]).includes(group),
  );

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
      authType,
      roleArn,
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
      exportFieldGroups: validatedData.exportFieldGroups
        ? [...validatedData.exportFieldGroups, ...storedTraceFieldGroups]
        : undefined,
    },
  });

  const responseData = toBlobStorageIntegrationResponse(integration);

  return res.status(200).json(responseData);
}
