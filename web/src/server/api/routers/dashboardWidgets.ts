import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod, orderBy, singleFilter } from "@langfuse/shared";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  DashboardWidgetChartType,
  DashboardWidgetViews,
} from "@langfuse/shared/src/db";
import {
  DashboardService,
  DimensionSchema,
  MetricSchema,
  ChartConfigSchema,
} from "@langfuse/shared/src/server";
import { views } from "@/src/features/query";

const CreateDashboardWidgetInput = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Widget name is required"),
  description: z.string(),
  view: views,
  dimensions: z.array(DimensionSchema),
  metrics: z.array(MetricSchema),
  filters: z.array(singleFilter),
  chartType: z.nativeEnum(DashboardWidgetChartType),
  chartConfig: ChartConfigSchema,
});

// Define the widget list input schema
const ListDashboardWidgetsInput = z.object({
  projectId: z.string(),
  ...paginationZod,
  orderBy: orderBy,
});

const viewMapping: Record<string, DashboardWidgetViews> = {
  traces: DashboardWidgetViews.TRACES,
  observations: DashboardWidgetViews.OBSERVATIONS,
  "scores-numeric": DashboardWidgetViews.SCORES_NUMERIC,
  "scores-categorical": DashboardWidgetViews.SCORES_CATEGORICAL,
};

export const dashboardWidgetRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateDashboardWidgetInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });

      // Create the widget using the DashboardService
      const widget = await DashboardService.createWidget(
        { ...input, view: viewMapping[input.view] },
        ctx.session.user?.id,
      );

      return {
        success: true,
        widget,
      };
    }),

  all: protectedProjectProcedure
    .input(ListDashboardWidgetsInput)
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:read",
      });

      const result = await DashboardService.listWidgets({
        projectId: input.projectId,
        limit: input.limit,
        page: input.page,
        orderBy: input.orderBy,
      });

      return result;
    }),
});
