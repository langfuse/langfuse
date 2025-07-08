import { auditLog } from "@/src/features/audit-logs/auditLog";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  PostBlobStorageIntegrationV1Body,
  PutBlobStorageIntegrationV1Body,
  BlobStorageIntegrationV1Response,
  transformBlobStorageIntegrationToAPIResponse,
} from "@/src/features/public-api/types/blob-storage-integration";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { env } from "@/src/env.mjs";
import { BlobStorageIntegrationType } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

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

  POST: createAuthedProjectAPIRoute({
    name: "Create Blob Storage Integration",
    bodySchema: PostBlobStorageIntegrationV1Body,
    responseSchema: BlobStorageIntegrationV1Response,
    successStatusCode: 201,
    rateLimitResource: "ingestion",
    fn: async ({ body, auth }) => {
      // Audit log for creation
      await auditLog({
        action: "create",
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
      } = body;

      // Validate credentials based on environment and type
      const isSelfHosted = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
      const canUseHostCredentials =
        isSelfHosted && type === BlobStorageIntegrationType.S3;
      const isUsingHostCredentials =
        canUseHostCredentials && (!accessKeyId || !secretAccessKey);

      if (!canUseHostCredentials && !accessKeyId) {
        throw new LangfuseNotFoundError(
          "Access Key ID and Secret Access Key are required",
        );
      }

      if (!isUsingHostCredentials && !secretAccessKey) {
        throw new LangfuseNotFoundError(
          "Secret access key is required for new configuration when not using host credentials",
        );
      }

      // Check if integration already exists for this project
      const existingIntegration =
        await prisma.blobStorageIntegration.findUnique({
          where: {
            projectId: auth.scope.projectId,
          },
        });

      if (existingIntegration) {
        throw new LangfuseNotFoundError(
          "Blob storage integration already exists for this project. Use PUT to update it.",
        );
      }

      // Create the new integration
      const integration = await prisma.blobStorageIntegration.create({
        data: {
          projectId: auth.scope.projectId,
          type,
          bucketName,
          endpoint: endpoint || null,
          region,
          accessKeyId,
          secretAccessKey: secretAccessKey
            ? encrypt(secretAccessKey)
            : undefined,
          prefix: prefix ?? "",
          exportFrequency,
          enabled,
          forcePathStyle,
          fileType,
        },
        omit: {
          secretAccessKey: true,
        },
      });

      return transformBlobStorageIntegrationToAPIResponse(integration);
    },
  }),

  PUT: createAuthedProjectAPIRoute({
    name: "Update Blob Storage Integration",
    bodySchema: PutBlobStorageIntegrationV1Body,
    responseSchema: BlobStorageIntegrationV1Response,
    rateLimitResource: "ingestion",
    fn: async ({ body, auth }) => {
      // Audit log for update
      await auditLog({
        action: "update",
        resourceType: "blobStorageIntegration",
        resourceId: auth.scope.projectId,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      });

      // Check if integration exists
      const existingIntegration =
        await prisma.blobStorageIntegration.findUnique({
          where: {
            projectId: auth.scope.projectId,
          },
        });

      if (!existingIntegration) {
        throw new LangfuseNotFoundError("Blob storage integration not found");
      }

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
      } = body;

      // Validate credentials based on environment and type
      const isSelfHosted = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
      const canUseHostCredentials =
        isSelfHosted &&
        (type === BlobStorageIntegrationType.S3 ||
          existingIntegration.type === BlobStorageIntegrationType.S3);

      if (!canUseHostCredentials && accessKeyId !== undefined && !accessKeyId) {
        throw new LangfuseNotFoundError(
          "Access Key ID and Secret Access Key are required",
        );
      }

      // Prepare update data
      const updateData: any = {};

      if (type !== undefined) updateData.type = type;
      if (bucketName !== undefined) updateData.bucketName = bucketName;
      if (endpoint !== undefined) updateData.endpoint = endpoint;
      if (region !== undefined) updateData.region = region;
      if (accessKeyId !== undefined) updateData.accessKeyId = accessKeyId;
      if (prefix !== undefined) updateData.prefix = prefix;
      if (exportFrequency !== undefined)
        updateData.exportFrequency = exportFrequency;
      if (enabled !== undefined) updateData.enabled = enabled;
      if (forcePathStyle !== undefined)
        updateData.forcePathStyle = forcePathStyle;
      if (fileType !== undefined) updateData.fileType = fileType;

      // Handle secret access key encryption if provided
      if (secretAccessKey !== undefined) {
        updateData.secretAccessKey = secretAccessKey
          ? encrypt(secretAccessKey)
          : undefined;
      }

      // Update the integration
      const updatedIntegration = await prisma.blobStorageIntegration.update({
        where: {
          projectId: auth.scope.projectId,
        },
        data: updateData,
        omit: {
          secretAccessKey: true,
        },
      });

      return transformBlobStorageIntegrationToAPIResponse(updatedIntegration);
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
