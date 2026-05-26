import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
  requireFeatureFlag,
} from "@/src/server/api/trpc";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { paginationZod, singleFilter } from "@langfuse/shared";
import {
  CreateMonitorSchema,
  DeleteMonitorSchema,
  GetMonitorByIdSchema,
  GetMonitorFilterOptionsSchema,
  type MonitorListFilter,
  MonitorListOrderBySchema,
  MonitorService,
  MonitorSeveritySchema,
  type SessionContext,
  UpdateMonitorSchema,
} from "@langfuse/shared/monitors/server";

type SingleFilter = z.infer<typeof singleFilter>;

/** ListMonitorsRouterInputSchema accepts the wire-format FilterState from the monitors table UI. */
const ListMonitorsRouterInputSchema = z.object({
  projectId: z.string(),
  orderBy: z
    .object({
      column: MonitorListOrderBySchema,
      order: z.enum(["ASC", "DESC"]),
    })
    .nullable(),
  filter: z.array(singleFilter).optional(),
  ...paginationZod,
});

/** filterStateToMonitorListFilter translates the UI FilterState into the service-shaped MonitorListFilter, expanding the UI's combined NO_DATA/UNKNOWN severity option. */
const filterStateToMonitorListFilter = (
  filter: SingleFilter[] | undefined,
): MonitorListFilter | undefined => {
  if (!filter) return undefined;
  const result: MonitorListFilter = {};
  for (const f of filter) {
    if (f.column === "severity" && f.type === "stringOptions") {
      const values = f.value
        .map((v) => MonitorSeveritySchema.safeParse(v))
        .flatMap((r) => (r.success ? [r.data] : []));
      if (values.includes("NO_DATA") && !values.includes("UNKNOWN")) {
        values.push("UNKNOWN");
      }
      if (values.length === 0) continue;
      if (f.operator === "any of") {
        result.severityIn = [...(result.severityIn ?? []), ...values];
      } else if (f.operator === "none of") {
        result.severityNotIn = [...(result.severityNotIn ?? []), ...values];
      }
      continue;
    }
    if (
      f.column === "tags" &&
      f.type === "arrayOptions" &&
      f.value.length > 0
    ) {
      if (f.operator === "any of") {
        result.tagsAnyOf = [...(result.tagsAnyOf ?? []), ...f.value];
      } else if (f.operator === "all of") {
        result.tagsAllOf = [...(result.tagsAllOf ?? []), ...f.value];
      } else if (f.operator === "none of") {
        result.tagsNoneOf = [...(result.tagsNoneOf ?? []), ...f.value];
      }
    }
  }
  return result;
};

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
    .input(ListMonitorsRouterInputSchema)
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "monitors:read",
      });
      return MonitorService.list(sessionContextFromCtx(ctx), {
        ...input,
        filter: filterStateToMonitorListFilter(input.filter),
      });
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
