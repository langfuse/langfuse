import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
  requireFeatureFlag,
  requireLangfuseCloud,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { throwIfExceedsLimit } from "@/src/features/entitlements/server/hasEntitlementLimit";
import {
  CreateMonitorSchema,
  DeleteMonitorSchema,
  GetMonitorByIdSchema,
  GetMonitorFilterOptionsSchema,
  ListMonitorsSchema,
  MonitorService,
  type SessionContext,
  UpdateMonitorSchema,
} from "@langfuse/shared/monitors/server";

/** monitorsProcedure protects every monitors route behind a Langfuse Cloud check and the `monitors` flag. */
const monitorsProcedure = protectedProjectProcedure
  .use(requireLangfuseCloud)
  .use(requireFeatureFlag("monitors"));

/** sessionContextFromCtx adapts a tRPC session into a MonitorService SessionContext. */
const sessionContextFromCtx = (ctx: {
  session: { user: { id: string } };
}): SessionContext => ({ userId: ctx.session.user.id });

export const monitorsRouter = createTRPCRouter({
  create: monitorsProcedure
    .input(CreateMonitorSchema)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "monitors:CUD",
      });

      const currentCount = await ctx.prisma.monitor.count({
        where: { project: { orgId: ctx.session.orgId, deletedAt: null } },
      });
      throwIfExceedsLimit({
        entitlementLimit: "monitor-count",
        sessionUser: ctx.session.user,
        orgId: ctx.session.orgId,
        currentUsage: currentCount,
      });

      return MonitorService.create(sessionContextFromCtx(ctx), input);
    }),

  update: monitorsProcedure
    .input(UpdateMonitorSchema)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "monitors:CUD",
      });
      return MonitorService.update(sessionContextFromCtx(ctx), input);
    }),

  delete: monitorsProcedure
    .input(DeleteMonitorSchema)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "monitors:CUD",
      });
      await MonitorService.delete(sessionContextFromCtx(ctx), input);
      return { success: true as const };
    }),

  get: monitorsProcedure
    .input(GetMonitorByIdSchema)
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "monitors:read",
      });
      return MonitorService.getById(sessionContextFromCtx(ctx), input);
    }),

  all: monitorsProcedure
    .input(ListMonitorsSchema)
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "monitors:read",
      });
      return MonitorService.list(sessionContextFromCtx(ctx), input);
    }),

  count: monitorsProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "monitors:read",
      });
      const count = await ctx.prisma.monitor.count({
        where: { project: { orgId: ctx.session.orgId, deletedAt: null } },
      });
      return { count };
    }),

  /** hasAny reports whether the project owns at least one monitor; drives the list-page onboarding splash. */
  hasAny: monitorsProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "monitors:read",
      });
      const monitor = await ctx.prisma.monitor.findFirst({
        where: { projectId: input.projectId },
        select: { id: true },
      });
      return monitor !== null;
    }),

  getFilterOptions: monitorsProcedure
    .input(GetMonitorFilterOptionsSchema)
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "monitors:read",
      });
      return MonitorService.getFilterOptions(sessionContextFromCtx(ctx), input);
    }),
});
