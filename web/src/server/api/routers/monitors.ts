import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
  requireV4Writes,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { createWithinEntitlementLimit } from "@/src/features/entitlements/server/createWithinEntitlementLimit";
import {
  listLinkedEvaluatorAlerts,
  suggestMonitorName,
} from "@/src/features/monitors/server";
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

/** monitorsProcedure protects monitor routes behind a v4Writes check. */
const monitorsProcedure = protectedProjectProcedure.use(requireV4Writes);

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
        scope: "alerts:CUD",
      });

      return createWithinEntitlementLimit({
        prisma: ctx.prisma,
        orgId: ctx.session.orgId,
        entitlementLimit: "monitor-count",
        sessionUser: ctx.session.user,
        countCurrentUsage: (tx) =>
          tx.monitor.count({
            where: { project: { orgId: ctx.session.orgId, deletedAt: null } },
          }),
        create: (tx) =>
          MonitorService.create(sessionContextFromCtx(ctx), input, tx),
      });
    }),

  update: monitorsProcedure
    .input(UpdateMonitorSchema)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "alerts:CUD",
      });
      return MonitorService.update(sessionContextFromCtx(ctx), input);
    }),

  delete: monitorsProcedure
    .input(DeleteMonitorSchema)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "alerts:CUD",
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
        scope: "alerts:read",
      });
      return MonitorService.getById(sessionContextFromCtx(ctx), input);
    }),

  all: monitorsProcedure
    .input(ListMonitorsSchema)
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "alerts:read",
      });
      return MonitorService.list(sessionContextFromCtx(ctx), input);
    }),

  count: monitorsProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "alerts:read",
      });
      const count = await ctx.prisma.monitor.count({
        where: { project: { orgId: ctx.session.orgId, deletedAt: null } },
      });
      return { count };
    }),

  suggestName: monitorsProcedure
    .input(
      z.object({
        projectId: z.string(),
        description: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "alerts:CUD",
      });
      return suggestMonitorName({
        prisma: ctx.prisma,
        projectId: input.projectId,
        description: input.description,
      });
    }),

  linkedEvaluatorAlerts: monitorsProcedure
    .input(z.object({ projectId: z.string(), evaluatorId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "alerts:read",
      });
      return listLinkedEvaluatorAlerts(ctx.prisma, {
        scope: "evaluator",
        projectId: input.projectId,
        evaluatorId: input.evaluatorId,
      });
    }),

  linkedAllEvaluatorSpendAlerts: monitorsProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "alerts:read",
      });
      return listLinkedEvaluatorAlerts(ctx.prisma, {
        scope: "allEvaluators",
        projectId: input.projectId,
      });
    }),

  /** hasAny reports whether the project owns at least one monitor; drives the list-page onboarding splash. */
  hasAny: monitorsProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "alerts:read",
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
        scope: "alerts:read",
      });
      return MonitorService.getFilterOptions(sessionContextFromCtx(ctx), input);
    }),
});
