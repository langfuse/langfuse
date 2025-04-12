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
} from "@langfuse/shared/src/server";

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

      const view = await TableViewService.updateSavedView(
        input,
        ctx.session.user?.id,
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

  // getByTableName: protectedProjectProcedure

  // generatePermalink: protectedProjectProcedure

  // resolve?
});
