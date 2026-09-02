import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  assertPersistedExportSourceAllowed,
  resolveExportSource,
} from "@/src/features/analytics-integrations/server/exportSource";
import { isPrismaRecordNotFoundError } from "@/src/features/analytics-integrations/server/isPrismaRecordNotFoundError";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { posthogIntegrationFormSchema } from "@/src/features/posthog-integration/types";
import { TRPCError } from "@trpc/server";
import { env } from "@/src/env.mjs";
import { validateWebhookURL } from "@langfuse/shared/src/server";
import { getDisplayCredential } from "@/src/features/analytics-integrations/server/displayCredential";
import {
  AnalyticsIntegrationExportSource,
  LangfuseNotFoundError,
  LEGACY_ANALYTICS_EXPORTER_CUTOFF,
} from "@langfuse/shared";

export const posthogIntegrationRouter = createTRPCRouter({
  get: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      const writeMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;
      try {
        const dbConfig = await ctx.prisma.posthogIntegration.findFirst({
          where: {
            projectId: input.projectId,
          },
        });

        if (!dbConfig) {
          return { config: null, writeMode };
        }

        const { encryptedPosthogApiKey, exportSource, ...config } = dbConfig;

        // Write-only credential: never return the plaintext key (write-only credential).
        return {
          config: {
            ...config,
            exportSource,
            posthogApiKeyDisplay: getDisplayCredential(
              decrypt(encryptedPosthogApiKey),
            ),
          },
          writeMode,
        };
      } catch (e) {
        console.error("posthog integration get", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),

  update: protectedProjectProcedure
    .input(
      posthogIntegrationFormSchema.extend({
        projectId: z.string(),
        // Drop the base schema default so an omitted value preserves the
        // persisted source instead of rewriting it to the legacy default.
        exportSource: z.enum(AnalyticsIntegrationExportSource).optional(),
      }),
    )
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

      const existingIntegration =
        await ctx.prisma.posthogIntegration.findUnique({
          where: { projectId: input.projectId },
          select: {
            exportSource: true,
            createdAt: true,
            encryptedPosthogApiKey: true,
          },
        });

      // Write-only credential: blank/omitted keeps the persisted encrypted
      // value (write-only credential).
      const encryptedPosthogApiKey = input.posthogProjectApiKey
        ? encrypt(input.posthogProjectApiKey)
        : existingIntegration?.encryptedPosthogApiKey;
      if (!encryptedPosthogApiKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "PostHog Project API Key is required",
        });
      }
      const createExportSource = await resolveExportSource({
        db: ctx.prisma,
        projectId: input.projectId,
        requestedExportSource: input.exportSource,
        existingIntegration,
        exporterCutoff: LEGACY_ANALYTICS_EXPORTER_CUTOFF,
      });

      await auditLog({
        session: ctx.session,
        action: "update",
        resourceType: "posthogIntegration",
        resourceId: input.projectId,
      });
      const { posthogProjectApiKey: _posthogProjectApiKey, ...config } = input;

      await ctx.prisma.$transaction(async (tx) => {
        const result = await tx.posthogIntegration.upsert({
          where: {
            projectId: input.projectId,
          },
          create: {
            projectId: input.projectId,
            posthogHostName: config.posthogHostname,
            encryptedPosthogApiKey,
            enabled: config.enabled,
            exportSource: createExportSource,
          },
          update: {
            encryptedPosthogApiKey,
            posthogHostName: config.posthogHostname,
            enabled: config.enabled,
            // undefined → Prisma omits the column → preserves the persisted
            // value on partial updates.
            exportSource: config.exportSource,
            // lastError is deliberately left intact so the last fault stays
            // visible until a successful run clears it.
          },
        });

        assertPersistedExportSourceAllowed({
          existingIntegration,
          result,
          exporterCutoff: LEGACY_ANALYTICS_EXPORTER_CUTOFF,
        });
      });
    }),
  delete: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
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

      try {
        await ctx.prisma.posthogIntegration.delete({
          where: {
            projectId: input.projectId,
          },
        });
      } catch (error) {
        if (isPrismaRecordNotFoundError(error)) {
          throw new LangfuseNotFoundError("PostHog integration not found");
        }

        throw error;
      }
    }),
});
