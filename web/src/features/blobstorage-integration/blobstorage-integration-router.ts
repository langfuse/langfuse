import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { encrypt } from "@langfuse/shared/encryption";
import { blobStorageIntegrationFormSchema } from "@/src/features/blobstorage-integration/types";
import { TRPCError } from "@trpc/server";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { logger } from "@langfuse/shared/src/server";
import { type BlobStorageIntegration } from "@langfuse/shared";

export const blobStorageIntegrationRouter = createTRPCRouter({
  get: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoEntitlement({
        entitlement: "integration-blobstorage",
        sessionUser: ctx.session.user,
        projectId: input.projectId,
      });
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
        throwIfNoEntitlement({
          entitlement: "integration-blobstorage",
          sessionUser: ctx.session.user,
          projectId: input.projectId,
        });
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
        } = input;

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
            // Record exists, perform update
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
            // For create, secretAccessKey is mandatory
            if (!secretAccessKey) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Secret access key is required for new configuration",
              });
            }

            return await prisma.blobStorageIntegration.create({
              data: {
                ...(data as BlobStorageIntegration),
                projectId: input.projectId,
                accessKeyId,
                secretAccessKey: encrypt(secretAccessKey),
              },
            });
          }
        });
      } catch (e) {
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
        throwIfNoEntitlement({
          entitlement: "integration-blobstorage",
          sessionUser: ctx.session.user,
          projectId: input.projectId,
        });
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
});
