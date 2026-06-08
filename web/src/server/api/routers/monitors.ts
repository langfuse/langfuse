import {
  createTRPCRouter,
  protectedProjectProcedure,
  requireFeatureFlag,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  CreateMonitorSchema,
  DeleteMonitorSchema,
  GetMonitorByIdSchema,
  ListMonitorsSchema,
  MonitorService,
  type SessionContext,
  UpdateMonitorSchema,
} from "@langfuse/shared/src/server";

/** monitorsProcedure protects every monitors route behind the `monitors` flag. */
const monitorsProcedure = protectedProjectProcedure.use(
  requireFeatureFlag("monitors"),
);

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
});
