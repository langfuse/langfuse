import { InvalidRequestError } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";
import { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/server";
import { createExternalMediaStorageService } from "@/src/features/external-media-storage/server/service";
import { externalMediaStorageFormSchema } from "@/src/features/external-media-storage/types";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

function assertIntegrationAccess({
  projectId,
  session,
}: {
  projectId: string;
  session: Session;
}) {
  throwIfNoProjectAccess({
    session,
    projectId,
    scope: "integrations:CRUD",
  });
}

function asBadRequest(error: unknown): never {
  if (error instanceof InvalidRequestError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const externalMediaStorageRouter = createTRPCRouter({
  get: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      assertIntegrationAccess({
        projectId: input.projectId,
        session: ctx.session,
      });
      return {
        config: await createExternalMediaStorageService(
          ctx.prisma,
        ).getConfiguration(ctx.session.projectId),
      };
    }),

  update: protectedProjectProcedure
    .input(
      externalMediaStorageFormSchema.extend({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      assertIntegrationAccess({
        projectId: input.projectId,
        session: ctx.session,
      });

      const { projectId: _projectId, ...values } = input;
      try {
        const result = await createExternalMediaStorageService(
          ctx.prisma,
        ).saveConfiguration({
          projectId: ctx.session.projectId,
          values,
        });
        await auditLog({
          session: ctx.session,
          action: "update",
          resourceType: "externalMediaStorageIntegration",
          resourceId: ctx.session.projectId,
        });
        return result;
      } catch (error) {
        logger.error("Failed to update external media storage integration", {
          projectId: ctx.session.projectId,
          error,
        });
        return asBadRequest(error);
      }
    }),

  delete: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      assertIntegrationAccess({
        projectId: input.projectId,
        session: ctx.session,
      });

      try {
        await createExternalMediaStorageService(ctx.prisma).deleteConfiguration(
          ctx.session.projectId,
        );
        await auditLog({
          session: ctx.session,
          action: "delete",
          resourceType: "externalMediaStorageIntegration",
          resourceId: ctx.session.projectId,
        });
      } catch (error) {
        logger.error("Failed to delete external media storage integration", {
          projectId: ctx.session.projectId,
          error,
        });
        return asBadRequest(error);
      }
    }),

  testObject: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), uri: z.string() }))
    .mutation(async ({ input, ctx }) => {
      assertIntegrationAccess({
        projectId: input.projectId,
        session: ctx.session,
      });

      try {
        return await createExternalMediaStorageService(ctx.prisma).testObject({
          projectId: ctx.session.projectId,
          uri: input.uri,
        });
      } catch (error) {
        if (error instanceof InvalidRequestError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? `Storage access failed: ${error.message}`
              : "Storage access failed",
        });
      }
    }),
});
