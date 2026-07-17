import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { blobStorageIntegrationFormSchemaBase } from "@/src/features/blobstorage-integration/types";
import {
  validateAzureContainerName,
  validateExportFieldGroups,
} from "@/src/features/blobstorage-integration/validation";
import { upsertBlobStorageIntegration } from "@/src/features/blobstorage-integration/service";
import { assertExportSourceAllowed } from "@/src/features/analytics-integrations/server/assertExportSourceAllowed";
import { TRPCError } from "@trpc/server";
import { env } from "@/src/env.mjs";
import {
  logger,
  BlobStorageIntegrationProcessingQueue,
  QueueJobs,
  StorageServiceFactory,
  blobStorageEndpointConnectionValidationOptions,
  validateBlobStorageEndpoint,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { decrypt } from "@langfuse/shared/encryption";
import {
  AnalyticsIntegrationExportSource,
  areLegacyWritesActive,
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  InvalidRequestError,
  isEnrichedBlobExportAvailable,
} from "@langfuse/shared";

const getAuditLogErrorType = (error: unknown) =>
  error instanceof TRPCError
    ? error.code
    : error instanceof Error
      ? error.name
      : "UnknownError";

const formatRootCause = (err: Error): string => {
  // SDK errors (e.g. S3, GCS) carry a descriptive name like
  // "SignatureDoesNotMatch" while .message is often generic ("Invalid argument.").
  const name = err.name && err.name !== "Error" ? err.name : "";
  if (name && err.message) return `${name}: ${err.message}`;
  return name || err.message;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof Error)) return fallback;
  // Walk the full cause chain to find the deepest (most specific) error.
  // StorageService wraps SDK errors in multiple layers of handleStorageError.
  let deepest: Error = error;
  while (deepest.cause instanceof Error) {
    deepest = deepest.cause;
  }
  if (deepest !== error) {
    const rootCause = formatRootCause(deepest);
    if (rootCause) return `${error.message}: ${rootCause}`.slice(0, 500);
  }
  return error.message;
};

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
        const isCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);
        const isEnrichedExportAvailable = isEnrichedBlobExportAvailable(
          isCloud,
          env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true",
        );
        // Data capability for legacy sources (see export-source-policy.ts).
        const legacyWritesActive = areLegacyWritesActive(
          env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
        );

        const config = await ctx.prisma.blobStorageIntegration.findFirst({
          where: {
            projectId: input.projectId,
          },
          omit: {
            secretAccessKey: true,
          },
        });

        return {
          config: config ?? null,
          isEnrichedExportAvailable,
          legacyWritesActive,
        };
      } catch (e) {
        logger.error(`Failed to get blob storage integration`, e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get blob storage integration",
        });
      }
    }),

  update: protectedProjectProcedure
    .input(
      blobStorageIntegrationFormSchemaBase
        .extend({
          projectId: z.string(),
          // Drop the base schema default so an omitted value preserves the
          // persisted source instead of rewriting it to the legacy default.
          exportSource: z.enum(AnalyticsIntegrationExportSource).optional(),
          // Same for fileType: drop the base default so an omitted value
          // preserves the persisted fileType instead of rewriting it.
          fileType: z.enum(BlobStorageIntegrationFileType).optional(),
        })
        .superRefine(validateAzureContainerName)
        .superRefine(validateExportFieldGroups),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "integrations:CRUD",
        });

        const isCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);
        const isV4PreviewEnabled =
          env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true";

        const existingIntegration =
          await ctx.prisma.blobStorageIntegration.findUnique({
            where: { projectId: input.projectId },
            select: { createdAt: true, exportSource: true },
          });

        // Cloud cutoffs gate explicit values only (the project is fetched just
        // for them); an omitted source preserves the row, and CREATE is covered
        // by forceEventsOnCreate below. See export-source-policy.ts.
        const projectCreatedAt = input.exportSource
          ? (
              await ctx.prisma.project.findUniqueOrThrow({
                where: { id: input.projectId },
                select: { createdAt: true },
              })
            ).createdAt
          : undefined;
        assertExportSourceAllowed({
          nextExportSource: input.exportSource,
          persistedExportSource: existingIntegration?.exportSource,
          ctx: {
            isCloud,
            enrichedAvailable: isEnrichedBlobExportAvailable(
              isCloud,
              isV4PreviewEnabled,
            ),
            legacyWritesActive: areLegacyWritesActive(
              env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
            ),
            projectCreatedAt,
            integrationCreatedAt: existingIntegration?.createdAt ?? null,
          },
        });

        await auditLog({
          session: ctx.session,
          action: "update",
          resourceType: "blobStorageIntegration",
          resourceId: input.projectId,
        });

        const { projectId, ...rest } = input;

        return await upsertBlobStorageIntegration({
          prisma: ctx.prisma,
          projectId,
          // Mirror the REST handler: substitute EVENTS for an omitted source on
          // a new Cloud row, and refuse a legacy source if a concurrent DELETE
          // flips this upsert to CREATE.
          forceEventsOnCreate: input.exportSource === undefined && isCloud,
          refuseLegacyOnCreate: isCloud,
          data: {
            type: rest.type,
            bucketName: rest.bucketName,
            endpoint: rest.endpoint || null,
            region: rest.region,
            accessKeyId: rest.accessKeyId ?? null,
            secretAccessKey: rest.secretAccessKey ?? null,
            prefix: rest.prefix ?? "",
            exportFrequency: rest.exportFrequency,
            enabled: rest.enabled,
            forcePathStyle: rest.forcePathStyle,
            fileType: rest.fileType,
            exportMode: rest.exportMode,
            exportStartDate: rest.exportStartDate ?? null,
            exportSource: rest.exportSource,
            exportFieldGroups: rest.exportFieldGroups,
            compressed: rest.compressed,
          },
        });
      } catch (e) {
        if (e instanceof TRPCError) {
          throw e;
        }
        if (e instanceof InvalidRequestError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e.message,
          });
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

        await auditLog({
          session: ctx.session,
          action: "runNow",
          resourceType: "blobStorageIntegration",
          resourceId: input.projectId,
          after: {
            outcome: "success",
            jobId,
          },
        }).catch((auditLogError) => {
          logger.error(
            `Failed to create audit log for blob storage integration run`,
            auditLogError,
          );
        });

        return { success: true, jobId };
      } catch (e) {
        logger.error(`Failed to trigger blob storage integration run`, e);
        await auditLog({
          session: ctx.session,
          action: "runNow",
          resourceType: "blobStorageIntegration",
          resourceId: input.projectId,
          after: {
            outcome: "failure",
            error: getAuditLogErrorType(e),
          },
        }).catch((auditLogError) => {
          logger.error(
            `Failed to create audit log for blob storage integration run`,
            auditLogError,
          );
        });
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

        if (endpoint) {
          await validateBlobStorageEndpoint(endpoint);
        }

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
          useOCIObjectStorage: false, // Not supported in blob storage integration
          googleCloudCredentials: undefined,
          awsSse: undefined,
          awsSseKmsKeyId: undefined,
          externalEndpoint: undefined,
          connectionValidation:
            blobStorageEndpointConnectionValidationOptions(),
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

        await auditLog({
          session: ctx.session,
          action: "validate",
          resourceType: "blobStorageIntegration",
          resourceId: input.projectId,
          after: {
            outcome: "success",
            testFileName,
          },
        }).catch((auditLogError) => {
          logger.error(
            `Failed to create audit log for blob storage integration validation`,
            auditLogError,
          );
        });

        return {
          success: true,
          message: "Validation successful! Test file uploaded.",
          testFileName,
          signedUrl: result.signedUrl,
        };
      } catch (e) {
        const errorMessage = getErrorMessage(
          e,
          "Unknown error occurred during validation",
        );

        logger.error(
          `Blob storage validation failed for project ${input.projectId}: ${errorMessage}`,
          e,
        );

        await auditLog({
          session: ctx.session,
          action: "validate",
          resourceType: "blobStorageIntegration",
          resourceId: input.projectId,
          after: {
            outcome: "failure",
            error: getAuditLogErrorType(e),
          },
        }).catch((auditLogError) => {
          logger.error(
            `Failed to create audit log for blob storage integration validation`,
            auditLogError,
          );
        });

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
