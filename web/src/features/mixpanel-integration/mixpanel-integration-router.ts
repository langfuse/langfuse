import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { assertExportSourceAllowed } from "@/src/features/analytics-integrations/server/assertExportSourceAllowed";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { mixpanelIntegrationFormSchema } from "@/src/features/mixpanel-integration/types";
import { TRPCError } from "@trpc/server";
import { env } from "@/src/env.mjs";
import {
  AnalyticsIntegrationExportSource,
  areLegacyWritesActive,
  InvalidRequestError,
  validateExportSource,
} from "@langfuse/shared";

export const mixpanelIntegrationRouter = createTRPCRouter({
  get: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "integrations:CRUD",
      });
      // Data capability for legacy sources (see export-source-policy.ts).
      const legacyWritesActive = areLegacyWritesActive(
        env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
      );
      try {
        const dbConfig = await ctx.prisma.mixpanelIntegration.findFirst({
          where: {
            projectId: input.projectId,
          },
        });

        if (!dbConfig) {
          return { config: null, legacyWritesActive };
        }

        const { encryptedMixpanelProjectToken, exportSource, ...config } =
          dbConfig;

        return {
          config: {
            ...config,
            exportSource,
            mixpanelProjectToken: decrypt(encryptedMixpanelProjectToken),
          },
          legacyWritesActive,
        };
      } catch (e) {
        console.error("mixpanel integration get", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    }),

  update: protectedProjectProcedure
    .input(
      mixpanelIntegrationFormSchema.extend({
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

      // EVENTS is always accepted by this router, hence enrichedAvailable:
      // true. An omitted source preserves the persisted row; on CREATE it
      // falls back to a default that is validated like an explicit choice
      // (LFE-9688 / LFE-10148). See export-source-policy.ts.
      const legacyWritesActive = areLegacyWritesActive(
        env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
      );
      const existingIntegration =
        await ctx.prisma.mixpanelIntegration.findUnique({
          where: { projectId: input.projectId },
          select: { exportSource: true, createdAt: true },
        });
      const createDefaultExportSource = legacyWritesActive
        ? AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS
        : AnalyticsIntegrationExportSource.EVENTS;
      const nextExportSource =
        input.exportSource ??
        (existingIntegration ? undefined : createDefaultExportSource);
      // The Cloud cutoffs need the project only for explicitly chosen (or
      // create-defaulted) sources.
      const projectCreatedAt = nextExportSource
        ? (
            await ctx.prisma.project.findUniqueOrThrow({
              where: { id: input.projectId },
              select: { createdAt: true },
            })
          ).createdAt
        : undefined;
      assertExportSourceAllowed({
        nextExportSource,
        persistedExportSource: existingIntegration?.exportSource,
        ctx: {
          isCloud: Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION),
          enrichedAvailable: true,
          legacyWritesActive,
          projectCreatedAt,
        },
      });

      await auditLog({
        session: ctx.session,
        action: "update",
        resourceType: "mixpanelIntegration",
        resourceId: input.projectId,
      });
      const { mixpanelProjectToken, ...config } = input;

      const encryptedMixpanelProjectToken = encrypt(mixpanelProjectToken);

      await ctx.prisma.$transaction(async (tx) => {
        const result = await tx.mixpanelIntegration.upsert({
          where: {
            projectId: input.projectId,
          },
          create: {
            projectId: input.projectId,
            mixpanelRegion: config.mixpanelRegion,
            encryptedMixpanelProjectToken,
            enabled: config.enabled,
            exportSource: config.exportSource ?? createDefaultExportSource,
          },
          update: {
            encryptedMixpanelProjectToken,
            mixpanelRegion: config.mixpanelRegion,
            enabled: config.enabled,
            // undefined → Prisma omits the column → preserves the persisted
            // value on partial updates (LFE-10296).
            exportSource: config.exportSource,
          },
        });

        // Race backstop (mirrors blob storage's service.ts): a concurrent
        // delete between the pre-flight read and this upsert can flip the
        // expected UPDATE into a CREATE carrying the unvalidated legacy
        // default. Detectable as a createdAt change; re-validate the persisted
        // row as an explicit choice and roll back on failure.
        if (
          input.exportSource === undefined &&
          existingIntegration &&
          result.createdAt.getTime() !== existingIntegration.createdAt.getTime()
        ) {
          const project = await tx.project.findUniqueOrThrow({
            where: { id: input.projectId },
            select: { createdAt: true },
          });
          const validation = validateExportSource(result.exportSource, {
            isCloud: Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION),
            enrichedAvailable: true,
            legacyWritesActive,
            projectCreatedAt: project.createdAt,
          });
          if (!validation.ok) throw new InvalidRequestError(validation.message);
        }
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
