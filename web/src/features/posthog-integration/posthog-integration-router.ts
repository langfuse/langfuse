import { z } from "zod/v4";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { posthogIntegrationFormSchema } from "@/src/features/posthog-integration/types";
import { TRPCError } from "@trpc/server";
import { env } from "@/src/env.mjs";
import { validateWebhookURL } from "@langfuse/shared/src/server";

export const posthogIntegrationRouter = createTRPCRouter({
  get: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
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

        const { encryptedPosthogApiKey, exportSource, ...config } = dbConfig;

        return {
          ...config,
          exportSource,
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

      // Validate PostHog hostname to prevent SSRF attacks
      try {
        await validateWebhookURL(input.posthogHostname);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? `Invalid PostHog hostname: ${error.message}`
              : "Invalid PostHog hostname",
        });
      }

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
          exportSource: config.exportSource,
        },
        update: {
          encryptedPosthogApiKey,
          posthogHostName: config.posthogHostname,
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
