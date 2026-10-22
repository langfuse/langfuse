import { ForbiddenError, InvalidRequestError } from "@langfuse/shared";
import {
  logger,
  OutboundUrlValidationError,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createExternalMediaStorageService } from "@/src/features/external-media-storage/server/service";
import { externalMediaStorageFormSchema } from "@/src/features/external-media-storage/types";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
  protectedProjectProcedureWithoutTracing,
} from "@/src/server/api/trpc";

function asBadRequest(error: unknown): never {
  if (
    error instanceof InvalidRequestError ||
    error instanceof OutboundUrlValidationError
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const externalMediaStorageRouter = createTRPCRouter({
  isFeatureEnabled: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        projectId: input.projectId,
        session: ctx.session,
        scope: "project:read",
      });
      return createExternalMediaStorageService(ctx.prisma).isFeatureEnabled(
        ctx.session.projectId,
      );
    }),

  get: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        projectId: input.projectId,
        session: ctx.session,
        scope: "integrations:CRUD",
      });
      return {
        config: await createExternalMediaStorageService(
          ctx.prisma,
        ).getConfiguration(ctx.session.projectId),
      };
    }),

  update: protectedProjectProcedureWithoutTracing
    .input(
      externalMediaStorageFormSchema.extend({
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        projectId: input.projectId,
        session: ctx.session,
        scope: "integrations:CRUD",
      });

      const { projectId: _projectId, ...values } = input;
      try {
        const result = await createExternalMediaStorageService(
          ctx.prisma,
        ).saveConfiguration({
          actor: { session: ctx.session },
          projectId: ctx.session.projectId,
          values,
        });
        return result;
      } catch (error) {
        if (error instanceof ForbiddenError) {
          throw error;
        }
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
      throwIfNoProjectAccess({
        projectId: input.projectId,
        session: ctx.session,
        scope: "integrations:CRUD",
      });

      try {
        await createExternalMediaStorageService(ctx.prisma).deleteConfiguration(
          {
            actor: { session: ctx.session },
            projectId: ctx.session.projectId,
          },
        );
      } catch (error) {
        if (error instanceof ForbiddenError) {
          throw error;
        }
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
      throwIfNoProjectAccess({
        projectId: input.projectId,
        session: ctx.session,
        scope: "integrations:CRUD",
      });

      try {
        return await createExternalMediaStorageService(ctx.prisma).testObject({
          projectId: ctx.session.projectId,
          uri: input.uri,
        });
      } catch (error) {
        if (error instanceof ForbiddenError) {
          throw error;
        }
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
