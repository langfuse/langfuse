import { TRPCError } from "@trpc/server";
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
import { InvalidRequestError } from "@langfuse/shared";

/** monitorsProcedure protects every monitors route behind the `monitors` flag. */
const monitorsProcedure = protectedProjectProcedure.use(
  requireFeatureFlag("monitors"),
);

/** sessionContextFromCtx adapts a tRPC session into a MonitorService SessionContext. */
const sessionContextFromCtx = (ctx: {
  session: { user: { id: string } };
}): SessionContext => ({ userId: ctx.session.user.id });

/** trpcErrorFromServiceError translates a MonitorService error into a TRPCError. */
const trpcErrorFromServiceError = (e: unknown): never => {
  if (e instanceof InvalidRequestError) {
    throw new TRPCError({ code: "NOT_FOUND", message: e.message });
  }
  throw e;
};

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
      try {
        return await MonitorService.update(sessionContextFromCtx(ctx), input);
      } catch (e) {
        return trpcErrorFromServiceError(e);
      }
    }),

  delete: monitorsProcedure
    .input(DeleteMonitorSchema)
    .mutation(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "monitors:CUD",
      });
      try {
        await MonitorService.delete(sessionContextFromCtx(ctx), input);
        return { success: true as const };
      } catch (e) {
        return trpcErrorFromServiceError(e);
      }
    }),

  get: monitorsProcedure
    .input(GetMonitorByIdSchema)
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "monitors:read",
      });
      const monitor = await MonitorService.getById(
        sessionContextFromCtx(ctx),
        input,
      );
      if (!monitor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Monitor not found",
        });
      }
      return monitor;
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
