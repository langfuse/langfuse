import { z } from "zod/v4";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { mixpanelIntegrationFormSchema } from "@/src/features/mixpanel-integration/types";
import { TRPCError } from "@trpc/server";
import { env } from "@/src/env.mjs";

export const mixpanelIntegrationRouter = createTRPCRouter({
  get: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      try {
        const dbConfig = await ctx.prisma.mixpanelIntegration.findFirst({
          where: {
            projectId: input.projectId,
          },
        });

        if (!dbConfig) {
          return null;
        }

        const { encryptedMixpanelProjectToken, exportSource, ...config } =
          dbConfig;

        return {
          ...config,
          exportSource,
          mixpanelProjectToken: decrypt(encryptedMixpanelProjectToken),
        };
      } catch (e) {
        console.error("mixpanel integration get", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),

  update: protectedProjectProcedure
    .input(mixpanelIntegrationFormSchema.extend({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      if (!env.ENCRYPTION_KEY) {
        if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error",
          });
        } else {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Missing environment variable: `ENCRYPTION_KEY`. Please consult our docs: https://langfuse.com/self-hosting",
          });
        }
      }
      await auditLog({
        session: ctx.session,
        action: "update",
        resourceType: "mixpanelIntegration",
        resourceId: input.projectId,
      });
      const { mixpanelProjectToken, ...config } = input;

      const encryptedMixpanelProjectToken = encrypt(mixpanelProjectToken);

      await ctx.prisma.mixpanelIntegration.upsert({
        where: {
          projectId: input.projectId,
        },
        create: {
          projectId: input.projectId,
          mixpanelRegion: config.mixpanelRegion,
          encryptedMixpanelProjectToken,
          enabled: config.enabled,
          exportSource: config.exportSource,
        },
        update: {
          encryptedMixpanelProjectToken,
          mixpanelRegion: config.mixpanelRegion,
          enabled: config.enabled,
          exportSource: config.exportSource,
        },
      });
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
          resourceType: "mixpanelIntegration",
          resourceId: input.projectId,
        });

        await ctx.prisma.mixpanelIntegration.delete({
          where: {
            projectId: input.projectId,
          },
        });
      } catch (e) {
        console.log("mixpanel integration delete", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
});
