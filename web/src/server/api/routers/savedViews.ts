import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  TableViewService,
  CreateSavedViewInput,
  UpdateSavedViewInput,
  UpdateSavedViewNameInput,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { LangfuseNotFoundError, SavedViewTableName } from "@langfuse/shared";

/**
 * Maps domain errors to appropriate TRPC errors
 * @param fn Function to execute that might throw domain errors
 * @param errorConfig Optional configuration for customizing error messages
 */
export async function withErrorMapping<T>(
  fn: () => Promise<T>,
  errorConfig?: {
    notFoundMessage?: string;
    // Add more error type configurations as needed
  },
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Map domain errors to TRPC errors
    if (error instanceof LangfuseNotFoundError) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: errorConfig?.notFoundMessage || error.message,
        cause: error,
      });
    }

    // Re-throw unknown errors
    throw error;
  }
}

export const savedViewsRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateSavedViewInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "savedViews:CUD",
      });

      const view = await TableViewService.createSavedView(
        input,
        ctx.session.user?.id,
      );

      return {
        success: true,
        view,
      };
    }),

  update: protectedProjectProcedure
    .input(UpdateSavedViewInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "savedViews:CUD",
      });

      const view = await withErrorMapping(
        () => TableViewService.updateSavedView(input, ctx.session.user?.id),
        { notFoundMessage: "Saved view not found, failed to update" },
      );

      return {
        success: true,
        view,
      };
    }),

  updateName: protectedProjectProcedure
    .input(UpdateSavedViewNameInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "savedViews:CUD",
      });

      const view = await withErrorMapping(
        () => TableViewService.updateSavedViewName(input, ctx.session.user?.id),
        { notFoundMessage: "Saved view not found, failed to update name" },
      );

      return {
        success: true,
        view,
      };
    }),

  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        savedViewId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "savedViews:CUD",
      });

      await TableViewService.deleteSavedView(
        input.savedViewId,
        input.projectId,
      );

      return {
        success: true,
      };
    }),

  getByTableName: protectedProjectProcedure
    .input(
      z.object({
        tableName: z.string(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "savedViews:read",
      });

      return await TableViewService.getSavedViewsByTableName(
        input.tableName,
        input.projectId,
      );
    }),

  getById: protectedProjectProcedure
    .input(z.object({ viewId: z.string(), projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "savedViews:read",
      });

      return await withErrorMapping(
        () => TableViewService.getSavedViewById(input.viewId, input.projectId),
        { notFoundMessage: "Saved view not found, likely it has been deleted" },
      );
    }),

  generatePermalink: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        viewId: z.string(),
        tableName: z.nativeEnum(SavedViewTableName),
        baseUrl: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "savedViews:read",
      });

      return await TableViewService.generatePermalink(
        input.baseUrl,
        input.viewId,
        input.tableName,
        input.projectId,
      );
    }),
});
