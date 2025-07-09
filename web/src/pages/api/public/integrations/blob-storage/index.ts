import { auditLog } from "@/src/features/audit-logs/auditLog";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  UpsertBlobStorageIntegrationV1Body,
  BlobStorageIntegrationV1Response,
  transformBlobStorageIntegrationToAPIResponse,
} from "@/src/features/public-api/types/blob-storage-integration";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { env } from "@/src/env.mjs";
import {
  BlobStorageIntegrationType,
  BlobStorageExportMode,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

// Unified upsert function for blob storage integration
const upsertBlobStorageIntegration = async ({
  body,
  auth,
  auditAction = "update",
}: {
  body: UpsertBlobStorageIntegrationV1Body;
  auth: any;
  auditAction?: "create" | "update";
}) => {
  // Audit log
  await auditLog({
    action: auditAction,
    resourceType: "blobStorageIntegration",
    resourceId: auth.scope.projectId,
    projectId: auth.scope.projectId,
    orgId: auth.scope.orgId,
    apiKeyId: auth.scope.apiKeyId,
  });

  const {
    type,
    bucketName,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    prefix,
    exportFrequency,
    enabled,
    forcePathStyle,
    fileType,
    exportMode,
    exportStartDate,
  } = body;

  // Check if integration already exists
  const existingIntegration = await prisma.blobStorageIntegration.findUnique({
    where: {
      projectId: auth.scope.projectId,
    },
  });

  // Validate credentials based on environment and type
  const isSelfHosted = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const canUseHostCredentials =
    isSelfHosted &&
    (type === BlobStorageIntegrationType.S3 ||
      existingIntegration?.type === BlobStorageIntegrationType.S3);
  const isUsingHostCredentials =
    canUseHostCredentials && (!accessKeyId || !secretAccessKey);

  if (!canUseHostCredentials && !accessKeyId) {
    throw new LangfuseNotFoundError(
      "Access Key ID and Secret Access Key are required",
    );
  }

  if (!isUsingHostCredentials && !secretAccessKey && !existingIntegration) {
    throw new LangfuseNotFoundError(
      "Secret access key is required for new configuration when not using host credentials",
    );
  }

  // Prepare data for create/update
  const data: any = {
    projectId: auth.scope.projectId,
    type,
    bucketName,
    endpoint: endpoint || null,
    region,
    accessKeyId,
    prefix: prefix ?? "",
    exportFrequency,
    enabled,
    forcePathStyle,
    fileType,
    exportMode: exportMode || BlobStorageExportMode.FULL_HISTORY,
    exportStartDate: exportStartDate || null,
  };

  // Handle secret access key encryption if provided
  if (secretAccessKey !== undefined) {
    data.secretAccessKey = secretAccessKey
      ? encrypt(secretAccessKey)
      : undefined;
  }

  // Perform upsert operation
  const integration = await prisma.blobStorageIntegration.upsert({
    where: {
      projectId: auth.scope.projectId,
    },
    create: data,
    update: Object.fromEntries(
      Object.entries(data).filter(([key]) => key !== "projectId"),
    ),
    omit: {
      secretAccessKey: true,
    },
  });

  return transformBlobStorageIntegrationToAPIResponse(integration);
};

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Blob Storage Integration",
    responseSchema: BlobStorageIntegrationV1Response,
    fn: async ({ auth }) => {
      const integration = await prisma.blobStorageIntegration.findUnique({
        where: {
          projectId: auth.scope.projectId,
        },
        omit: {
          secretAccessKey: true,
        },
      });

      if (!integration) {
        throw new LangfuseNotFoundError("Blob storage integration not found");
      }

      return transformBlobStorageIntegrationToAPIResponse(integration);
    },
  }),

  PUT: createAuthedProjectAPIRoute({
    name: "Create or Update Blob Storage Integration",
    bodySchema: UpsertBlobStorageIntegrationV1Body,
    responseSchema: BlobStorageIntegrationV1Response,
    rateLimitResource: "ingestion",
    fn: async ({ body, auth }) => {
      // Check if integration already exists to determine audit action and status code
      const existingIntegration =
        await prisma.blobStorageIntegration.findUnique({
          where: {
            projectId: auth.scope.projectId,
          },
        });

      return await upsertBlobStorageIntegration({
        body,
        auth,
        auditAction: existingIntegration ? "update" : "create",
      });
    },
  }),

  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Blob Storage Integration",
    responseSchema: BlobStorageIntegrationV1Response,
    fn: async ({ auth }) => {
      // Audit log for deletion
      await auditLog({
        action: "delete",
        resourceType: "blobStorageIntegration",
        resourceId: auth.scope.projectId,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      });

      // Check if integration exists before deletion
      const existingIntegration =
        await prisma.blobStorageIntegration.findUnique({
          where: {
            projectId: auth.scope.projectId,
          },
          omit: {
            secretAccessKey: true,
          },
        });

      if (!existingIntegration) {
        throw new LangfuseNotFoundError("Blob storage integration not found");
      }

      // Delete the integration
      await prisma.blobStorageIntegration.delete({
        where: {
          projectId: auth.scope.projectId,
        },
      });

      return transformBlobStorageIntegrationToAPIResponse(existingIntegration);
    },
  }),
});
