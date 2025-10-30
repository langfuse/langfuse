import { z } from "zod/v4";
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
} from "@langfuse/shared/src/server";
import { TableViewPresetTableName } from "@langfuse/shared";

export const TableViewPresetsRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateTableViewPresetsInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "TableViewPresets:CUD",
      });

      const view = await TableViewService.createTableViewPresets(
        input,
        ctx.session.user?.id,
      );

      return {
        success: true,
        view,
      };
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

      await TableViewService.deleteTableViewPresets(
        input.tableViewPresetsId,
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
});
