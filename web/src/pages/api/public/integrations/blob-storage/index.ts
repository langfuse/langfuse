import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import { type NextApiRequest, type NextApiResponse } from "next";
import { hasEntitlementBasedOnPlan } from "@/src/features/entitlements/server/hasEntitlement";
import {
  CreateBlobStorageIntegrationRequest,
  type BlobStorageIntegrationResponseType,
} from "@/src/features/public-api/types/blob-storage-integrations";
import {
  LangfuseNotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";

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
      nextSyncAt: integration.nextSyncAt,
      lastSyncAt: integration.lastSyncAt,
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
    select: { id: true, orgId: true },
  });
  if (!project || project.orgId !== authCheck.scope.orgId) {
    throw new LangfuseNotFoundError("Project not found");
  }

  // Prepare data for database
  const dbData = {
    projectId: validatedData.projectId,
    type: validatedData.type,
    bucketName: validatedData.bucketName,
    endpoint: validatedData.endpoint || null,
    region: validatedData.region,
    accessKeyId: validatedData.accessKeyId || null,
    secretAccessKey: validatedData.secretAccessKey
      ? encrypt(validatedData.secretAccessKey)
      : null,
    prefix: validatedData.prefix,
    exportFrequency: validatedData.exportFrequency,
    enabled: validatedData.enabled,
    forcePathStyle: validatedData.forcePathStyle,
    fileType: validatedData.fileType,
    exportMode: validatedData.exportMode,
    exportStartDate: validatedData.exportStartDate || null,
  };

  // Upsert the integration (create or update)
  const integration = await prisma.blobStorageIntegration.upsert({
    where: { projectId: validatedData.projectId },
    update: dbData,
    create: dbData,
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
    nextSyncAt: integration.nextSyncAt,
    lastSyncAt: integration.lastSyncAt,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };

  return res.status(200).json(responseData);
}
