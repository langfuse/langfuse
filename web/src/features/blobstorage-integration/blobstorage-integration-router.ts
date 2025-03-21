import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { blobStorageIntegrationFormSchema } from "@/src/features/blobstorage-integration/types";
import { TRPCError } from "@trpc/server";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";

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
        const dbConfig = await ctx.prisma.blobStorageIntegration.findFirst({
          where: {
            projectId: input.projectId,
          },
        });

        if (!dbConfig) {
          return null;
        }

        const { encryptedSecretAccessKey, ...config } = dbConfig;

        return {
          ...config,
          secretAccessKey: decrypt(encryptedSecretAccessKey),
        };
      } catch (e) {
        console.error("blobstorage integration get", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
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
        const { secretAccessKey, ...config } = input;

        const encryptedSecretAccessKey = encrypt(secretAccessKey);

        await ctx.prisma.blobStorageIntegration.upsert({
          where: {
            projectId: input.projectId,
          },
          create: {
            projectId: input.projectId,
            provider: config.provider,
            bucketName: config.bucketName,
            endpoint: config.endpoint || null,
            region: config.region || null,
            accessKeyId: config.accessKeyId,
            encryptedSecretAccessKey,
            exportPrefix: config.exportPrefix || null,
            exportFrequency: config.exportFrequency,
            enabled: config.enabled,
            forcePathStyle: config.forcePathStyle || false,
            lastExportAt: null,
          },
          update: {
            provider: config.provider,
            bucketName: config.bucketName,
            endpoint: config.endpoint || null,
            region: config.region || null,
            accessKeyId: config.accessKeyId,
            encryptedSecretAccessKey,
            exportPrefix: config.exportPrefix || null,
            exportFrequency: config.exportFrequency,
            enabled: config.enabled,
            forcePathStyle: config.forcePathStyle || false,
          },
        });
      } catch (e) {
        console.log("blobstorage integration update", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
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
        console.log("blobstorage integration delete", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
});