import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  getDashboardBlocksSchema,
  getDashboardBlockCapabilities,
  getDashboardBlocks,
  removeDashboardBlock,
  removeDashboardBlockSchema,
  saveDashboardBlock,
  saveDashboardBlockSchema,
} from "./dashboardBlockService";

export const dashboardBlocksRouter = createTRPCRouter({
  capabilities: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:read",
      });
      return getDashboardBlockCapabilities(input.projectId);
    }),
  getAll: protectedProjectProcedure
    .input(getDashboardBlocksSchema)
    .query(({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:read",
      });
      return getDashboardBlocks(input);
    }),
  save: protectedProjectProcedure
    .input(saveDashboardBlockSchema)
    .mutation(({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });
      return saveDashboardBlock(input);
    }),
  remove: protectedProjectProcedure
    .input(removeDashboardBlockSchema)
    .mutation(({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });
      return removeDashboardBlock(input);
    }),
});
