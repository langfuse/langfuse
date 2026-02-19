import { z } from "zod/v4";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { encrypt } from "@langfuse/shared/encryption";
import { blobStorageIntegrationFormSchema } from "@/src/features/blobstorage-integration/types";
import { TRPCError } from "@trpc/server";
import {
  logger,
  BlobStorageIntegrationProcessingQueue,
  QueueJobs,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { decrypt } from "@langfuse/shared/encryption";
import {
  type BlobStorageIntegration,
  BlobStorageIntegrationType,
  BlobStorageExportMode,
} from "@langfuse/shared";
import { env } from "@/src/env.mjs";

export const blobStorageIntegrationRouter = createTRPCRouter({
  get: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      try {
        const config = await ctx.prisma.blobStorageIntegration.findFirst({
          where: {
            projectId: input.projectId,
          },
          omit: {
            secretAccessKey: true,
          },
        });

        if (!config) {
          return null;
        }

        return config;
      } catch (e) {
        logger.error(`Failed to get blob storage integration`, e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get blob storage integration",
        });
      }
    }),

  update: protectedProjectProcedure
    .input(blobStorageIntegrationFormSchema.extend({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "integrations:CRUD",
        });
        await auditLog({
          session: ctx.session,
          action: "update",
          resourceType: "blobStorageIntegration",
          resourceId: input.projectId,
        });

        // Extract data from input
        const {
          accessKeyId,
          secretAccessKey,
          type,
          bucketName,
          endpoint,
          region,
          prefix,
          exportFrequency,
          enabled,
          forcePathStyle,
          fileType,
          exportMode,
          exportStartDate,
          exportSource,
        } = input;

        const isSelfHosted = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
        const canUseHostCredentials =
          isSelfHosted && type === BlobStorageIntegrationType.S3;
        const isUsingHostCredentials =
          canUseHostCredentials && (!accessKeyId || !secretAccessKey);

        if (!canUseHostCredentials && !accessKeyId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Access Key ID and Secret Access Key are required",
          });
        }

        // Determine the export start date based on export mode
        let finalExportStartDate: Date | null = null;
        if (exportMode === BlobStorageExportMode.FROM_TODAY) {
          finalExportStartDate = new Date();
        } else if (exportMode === BlobStorageExportMode.FROM_CUSTOM_DATE) {
          finalExportStartDate = exportStartDate || new Date();
        }
        // For FULL_HISTORY mode, exportStartDate remains null

        const data: Partial<BlobStorageIntegration> = {
          type,
          bucketName,
          endpoint: endpoint || null,
          region,
          prefix: prefix ?? "",
          exportFrequency,
          enabled,
          accessKeyId,
          forcePathStyle: forcePathStyle || false,
          fileType,
          exportMode,
          exportStartDate: finalExportStartDate,
          exportSource,
        };

        // Use a transaction to check if record exists, then create or update
        return await ctx.prisma.$transaction(async (prisma) => {
          // Check if a record exists for this project
          const existingConfig = await prisma.blobStorageIntegration.findUnique(
            {
              where: {
                projectId: input.projectId,
              },
            },
          );

          if (existingConfig) {
            if (secretAccessKey) {
              data.secretAccessKey = encrypt(secretAccessKey);
            }

            return await prisma.blobStorageIntegration.update({
              where: {
                projectId: input.projectId,
              },
              data,
            });
          } else {
            // Record doesn't exist, perform create
            if (!isUsingHostCredentials && !secretAccessKey) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "Secret access key is required for new configuration when not using host credentials",
              });
            }

            return await prisma.blobStorageIntegration.create({
              data: {
                ...(data as BlobStorageIntegration),
                projectId: input.projectId,
                accessKeyId,
                secretAccessKey: secretAccessKey
                  ? encrypt(secretAccessKey)
                  : undefined,
              },
            });
          }
        });
      } catch (e) {
        if (e instanceof TRPCError) {
          throw e;
        }
        logger.error(`Failed to update blob storage integration`, e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update blob storage integration",
        });
      }
    }),
  delete: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "integrations:CRUD",
        });
        await auditLog({
          session: ctx.session,
          action: "delete",
          resourceType: "blobStorageIntegration",
          resourceId: input.projectId,
        });

        await ctx.prisma.blobStorageIntegration.delete({
          where: {
            projectId: input.projectId,
          },
        });
      } catch (e) {
        logger.error(`Failed to delete blob storage integration`, e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete blob storage integration",
        });
      }
    }),

  runNow: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "integrations:CRUD",
        });

        // Check if integration exists and is enabled
        const integration = await ctx.prisma.blobStorageIntegration.findUnique({
          where: {
            projectId: input.projectId,
          },
        });

        if (!integration) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Blob storage integration not found for this project",
          });
        }

        if (!integration.enabled) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Blob storage integration is disabled",
          });
        }

        // Get the processing queue
        const blobStorageIntegrationProcessingQueue =
          BlobStorageIntegrationProcessingQueue.getInstance();
        if (!blobStorageIntegrationProcessingQueue) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "BlobStorageIntegrationProcessingQueue not initialized",
          });
        }

        // Create a unique job ID for manual runs to avoid conflicts
        const jobId = `${input.projectId}-manual-${new Date().toISOString()}`;

        // Enqueue the processing job
        await blobStorageIntegrationProcessingQueue.add(
          QueueJobs.BlobStorageIntegrationProcessingJob,
          {
            id: randomUUID(),
            name: QueueJobs.BlobStorageIntegrationProcessingJob,
            timestamp: new Date(),
            payload: {
              projectId: input.projectId,
            },
          },
          {
            jobId,
          },
        );

        logger.info(
          `Manual blob storage integration job queued for project ${input.projectId}`,
        );

        return { success: true, jobId };
      } catch (e) {
        logger.error(`Failed to trigger blob storage integration run`, e);
        if (e instanceof TRPCError) {
          throw e;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to trigger blob storage integration run",
        });
      }
    }),

  validate: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "integrations:CRUD",
        });

        // Get persisted configuration
        const integration = await ctx.prisma.blobStorageIntegration.findUnique({
          where: {
            projectId: input.projectId,
          },
        });

        if (!integration) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "Blob storage integration not found for this project. Please save your configuration first.",
          });
        }

        // Extract configuration from persisted data
        const {
          type,
          bucketName,
          endpoint,
          region,
          accessKeyId,
          secretAccessKey: encryptedSecretAccessKey,
          prefix,
          forcePathStyle,
        } = integration;

        const secretAccessKey = encryptedSecretAccessKey
          ? decrypt(encryptedSecretAccessKey)
          : undefined;

        // Create storage service with provided configuration
        const storageService = StorageServiceFactory.getInstance({
          accessKeyId: accessKeyId || undefined,
          secretAccessKey,
          bucketName,
          endpoint: endpoint || undefined,
          region: region || undefined,
          forcePathStyle: forcePathStyle || false,
          useAzureBlob: type === BlobStorageIntegrationType.AZURE_BLOB_STORAGE,
          useGoogleCloudStorage: false, // Not supported in blob storage integration
          googleCloudCredentials: undefined,
          awsSse: undefined,
          awsSseKmsKeyId: undefined,
          externalEndpoint: undefined,
        });

        // Create a test file
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const testFileName = `${prefix || ""}langfuse-validation-test-${timestamp}.txt`;
        const testContent = `Langfuse blob storage validation test
Project ID: ${input.projectId}
Timestamp: ${new Date().toISOString()}
Configuration: ${type} storage
This file can be safely deleted.`;

        // Upload the test file
        const result = await storageService.uploadWithSignedUrl({
          fileName: testFileName,
          fileType: "text/plain",
          data: testContent,
          expiresInSeconds: 3600, // 1 hour
        });

        logger.info(
          `Blob storage validation successful for project ${input.projectId}`,
        );

        return {
          success: true,
          message: "Validation successful! Test file uploaded.",
          testFileName,
          signedUrl: result.signedUrl,
        };
      } catch (e) {
        logger.error(
          `Blob storage validation failed for project ${input.projectId}`,
          e,
        );

        // Extract meaningful error message
        let errorMessage = "Unknown error occurred during validation";
        if (e instanceof Error) {
          errorMessage = e.message;
        }

        if (e instanceof TRPCError) {
          throw e;
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Validation failed: ${errorMessage}`,
        });
      }
    }),
});
