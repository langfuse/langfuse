import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  TableViewService,
  CreateTableViewPresetsInput,
  UpdateTableViewPresetsInput,
  UpdateTableViewPresetsNameInput,
  DefaultViewService,
  GetDefaultViewInput,
  SetDefaultViewInput,
  ClearDefaultViewInput,
} from "@langfuse/shared/src/server";
import {
  LangfuseConflictError,
  Prisma,
  TableViewPresetTableName,
} from "@langfuse/shared";

export const TableViewPresetsRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateTableViewPresetsInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:CUD",
      });

      try {
        const view = await TableViewService.createTableViewPresets(
          input,
          ctx.session.user?.id,
        );

        return {
          success: true,
          view,
        };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new LangfuseConflictError(
            "Table view preset with this name already exists. Please choose a different name.",
          );
        }
        throw error;
      }
    }),

  update: protectedProjectProcedure
    .input(UpdateTableViewPresetsInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:CUD",
      });

      const view = await TableViewService.updateTableViewPresets(
        input,
        ctx.session.user?.id,
      );

      return {
        success: true,
        view,
      };
    }),

  updateName: protectedProjectProcedure
    .input(UpdateTableViewPresetsNameInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:CUD",
      });

      const view = await TableViewService.updateTableViewPresetsName(
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
        tableViewPresetsId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:CUD",
      });

      // Use transaction to ensure atomicity
      // Delete view first (validates it exists), then cleanup defaults
      await ctx.prisma.$transaction(async (tx) => {
        // Delete the view preset (will throw if not found)
        await tx.tableViewPreset.delete({
          where: {
            id: input.tableViewPresetsId,
            projectId: input.projectId,
          },
        });

        // Cleanup any default view references
        await tx.defaultView.deleteMany({
          where: { viewId: input.tableViewPresetsId },
        });
      });

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
        scope: "TableViewPresets:read",
      });

      return await TableViewService.getTableViewPresetsByTableName(
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
        scope: "TableViewPresets:read",
      });

      return await TableViewService.getTableViewPresetsById(
        input.viewId,
        input.projectId,
      );
    }),

  generatePermalink: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        viewId: z.string(),
        tableName: z.enum(TableViewPresetTableName),
        baseUrl: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:read",
      });

      return await TableViewService.generatePermalink(
        input.baseUrl,
        input.viewId,
        input.tableName,
        input.projectId,
      );
    }),

  getDefault: protectedProjectProcedure
    .input(GetDefaultViewInput)
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:read",
      });

      return await DefaultViewService.getResolvedDefault({
        ...input,
        userId: ctx.session.user?.id,
      });
    }),

  setAsDefault: protectedProjectProcedure
    .input(SetDefaultViewInput)
    .mutation(async ({ input, ctx }) => {
      // User-level defaults only need read access, project-level needs CUD
      const scope =
        input.scope === "project"
          ? "TableViewPresets:CUD"
          : "TableViewPresets:read";

      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope,
      });

      let viewName = input.viewName;

      // For non-system presets, always validate viewId exists and get viewName
      if (!input.viewId.startsWith("__langfuse_")) {
        const view = await TableViewService.getTableViewPresetsById(
          input.viewId,
          input.projectId,
        );
        // Use provided viewName or infer from view's tableName
        viewName = viewName ?? view.tableName;
      } else if (!viewName) {
        // System presets require explicit viewName
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "viewName is required for system presets",
        });
      }

      await DefaultViewService.setAsDefault({
        projectId: input.projectId,
        viewId: input.viewId,
        viewName,
        scope: input.scope,
        userId: input.scope === "user" ? ctx.session.user?.id : undefined,
      });

      return { success: true };
    }),

  clearDefault: protectedProjectProcedure
    .input(ClearDefaultViewInput)
    .mutation(async ({ input, ctx }) => {
      // User-level defaults only need read access, project-level needs CUD
      const scope =
        input.scope === "project"
          ? "TableViewPresets:CUD"
          : "TableViewPresets:read";

      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope,
      });

      await DefaultViewService.clearDefault({
        ...input,
        userId: input.scope === "user" ? ctx.session.user?.id : undefined,
      });

      return { success: true };
    }),
});
