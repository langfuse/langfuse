import { z } from "zod";
import { ForbiddenError } from "@langfuse/shared";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  hasProjectAccess,
  throwIfNoProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import { canAuthorDashboardBlocks } from "@/src/features/feature-flags/utils";
import {
  getDashboardBlocksSchema,
  getDashboardBlocks,
  removeDashboardBlock,
  removeDashboardBlockSchema,
  saveDashboardBlock,
  saveDashboardBlockSchema,
} from "./dashboardBlockService";

const authorDashboardBlock = protectedProjectProcedure
  .input(z.object({ projectId: z.string() }))
  .use(({ ctx, input, next }) => {
    throwIfNoProjectAccess({
      session: ctx.session,
      projectId: input.projectId,
      scope: "dashboards:CUD",
    });
    if (!canAuthorDashboardBlocks(ctx.session)) {
      throw new ForbiddenError(
        "Dashboard block authoring requires the employee feature preview.",
      );
    }
    return next();
  });

export const dashboardBlocksRouter = createTRPCRouter({
  capabilities: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:read",
      });
      const enabled =
        canAuthorDashboardBlocks(ctx.session) &&
        hasProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "dashboards:CUD",
        });
      return { multiQuery: enabled, markdown: enabled };
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
  save: authorDashboardBlock
    .input(saveDashboardBlockSchema)
    .mutation(({ input }) => saveDashboardBlock(input)),
  remove: authorDashboardBlock
    .input(removeDashboardBlockSchema)
    .mutation(({ input }) => removeDashboardBlock(input)),
});
