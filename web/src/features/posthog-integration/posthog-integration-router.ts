import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { posthogIntegrationFormSchema } from "@/src/features/posthog-integration/types";
import { TRPCError } from "@trpc/server";

export const posthogIntegrationRouter = createTRPCRouter({
  get: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      try {
        const dbConfig = await ctx.prisma.posthogIntegration.findFirst({
          where: {
            projectId: input.projectId,
          },
        });

        if (!dbConfig) {
          return null;
        }

        const { encryptedPosthogApiKey, ...config } = dbConfig;

        return {
          ...config,
          posthogApiKey: decrypt(encryptedPosthogApiKey),
        };
      } catch (e) {
        console.error("posthog integration get", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),

  update: protectedProjectProcedure
    .input(posthogIntegrationFormSchema.extend({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "integrations:CRUD",
        });
        await auditLog({
          session: ctx.session,
          action: "update",
          resourceType: "posthogIntegration",
          resourceId: input.projectId,
        });
        const { posthogProjectApiKey, ...config } = input;

        const encryptedPosthogApiKey = encrypt(posthogProjectApiKey);

        await ctx.prisma.posthogIntegration.upsert({
          where: {
            projectId: input.projectId,
          },
          create: {
            projectId: input.projectId,
            posthogHostName: config.posthogHostname,
            encryptedPosthogApiKey,
            enabled: config.enabled,
          },
          update: {
            encryptedPosthogApiKey,
            posthogHostName: config.posthogHostname,
            enabled: config.enabled,
          },
        });
      } catch (e) {
        console.log("posthog integration update", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
  delete: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "integrations:CRUD",
        });
        await auditLog({
          session: ctx.session,
          action: "delete",
          resourceType: "posthogIntegration",
          resourceId: input.projectId,
        });

        await ctx.prisma.posthogIntegration.delete({
          where: {
            projectId: input.projectId,
          },
        });
      } catch (e) {
        console.log("posthog integration delete", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),
});
