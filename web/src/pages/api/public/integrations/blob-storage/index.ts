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
  BlobStorageIntegrationType,
  LangfuseNotFoundError,
  type Plan,
  StorageIntegrationAuthType,
  TRACE_EXPORT_FIELD_GROUPS,
  type ExportFieldGroup,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import { getCrossAccountRoleArn } from "@langfuse/shared/src/server/ee/storageRoleAuth/storageRoleCredentials";
import { canPlanUseStorageRoleAuth } from "@/src/ee/features/storage-role-auth/server/storageRoleAuthEntitlement";
import { upsertBlobStorageIntegration } from "@/src/features/blobstorage-integration/service";
import { resolveExportSource } from "@/src/features/analytics-integrations/server/exportSource";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { authorizeBlobStorageRequest } from "@/src/features/blobstorage-integration/authorizeBlobStorageRequest";

// Never includes secretAccessKey. The external ID is not a secret: the customer
// needs it for the role's trust policy.
function toBlobStorageIntegrationResponse(
  integration: BlobStorageIntegration,
  crossAccountRoleArn: string | null,
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
    crossAccountRoleArn,
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

// Null when this deployment or the plan does not offer IAM role auth.
function getEntitledCrossAccountRoleArn(plan: Plan) {
  return canPlanUseStorageRoleAuth(plan) ? getCrossAccountRoleArn() : null;
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

  const crossAccountRoleArn = getEntitledCrossAccountRoleArn(scope.plan);
  const responseData = integrations.map((integration) =>
    toBlobStorageIntegrationResponse(integration, crossAccountRoleArn),
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

  // An omitted authType means IAM role auth for S3 when the request sends a
  // role ARN or the integration already uses one, unless it sends access keys. A
  // GET-then-PUT round trip therefore keeps the stored auth type.
  const sendsAccessKeys = !!(
    validatedData.accessKeyId || validatedData.secretAccessKey
  );
  const authType =
    validatedData.authType ??
    (validatedData.type === BlobStorageIntegrationType.S3 &&
    !sendsAccessKeys &&
    (validatedData.roleArn ||
      existingIntegration?.authType === StorageIntegrationAuthType.ROLE_ARN)
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
    canUseRoleAuth: canPlanUseStorageRoleAuth(scope.plan),
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

  const responseData = toBlobStorageIntegrationResponse(
    integration,
    getEntitledCrossAccountRoleArn(scope.plan),
  );

  return res.status(200).json(responseData);
}
