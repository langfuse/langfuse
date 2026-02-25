import { z } from "zod/v4";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { orderBy, singleFilter, optionalPaginationZod } from "@langfuse/shared";
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
import {
  views,
  getValidAggregationsForMeasureType,
} from "@/src/features/query";
import { getViewDeclaration } from "@/src/features/query/dataModel";
import { TRPCError } from "@trpc/server";
import type { ViewVersion } from "@/src/features/query";
import { LangfuseConflictError } from "@langfuse/shared";

const CreateDashboardWidgetInput = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Widget name is required"),
  description: z.string(),
  view: views,
  dimensions: z.array(DimensionSchema),
  metrics: z.array(MetricSchema),
  filters: z.array(singleFilter),
  chartType: z.enum(DashboardWidgetChartType),
  chartConfig: ChartConfigSchema,
  minVersion: z.number().int().optional(),
});

// Define update widget input schema (without projectId)
const UpdateDashboardWidgetInput = z.object({
  projectId: z.string(),
  widgetId: z.string(),
  name: z.string().min(1, "Widget name is required"),
  description: z.string(),
  view: views,
  dimensions: z.array(DimensionSchema),
  metrics: z.array(MetricSchema),
  filters: z.array(singleFilter),
  chartType: z.enum(DashboardWidgetChartType),
  chartConfig: ChartConfigSchema,
  minVersion: z.number().int().optional(),
});

// Define the widget list input schema
const ListDashboardWidgetsInput = z.object({
  projectId: z.string(),
  ...optionalPaginationZod,
  orderBy: orderBy,
});

// Get widget by ID input schema
const GetDashboardWidgetInput = z.object({
  projectId: z.string(),
  widgetId: z.string(),
});

const viewMapping: Record<string, DashboardWidgetViews> = {
  traces: DashboardWidgetViews.TRACES,
  observations: DashboardWidgetViews.OBSERVATIONS,
  "scores-numeric": DashboardWidgetViews.SCORES_NUMERIC,
  "scores-categorical": DashboardWidgetViews.SCORES_CATEGORICAL,
};

// Reverse mapping for client-side use
const reverseViewMapping: Record<DashboardWidgetViews, string> = {
  [DashboardWidgetViews.TRACES]: "traces",
  [DashboardWidgetViews.OBSERVATIONS]: "observations",
  [DashboardWidgetViews.SCORES_NUMERIC]: "scores-numeric",
  [DashboardWidgetViews.SCORES_CATEGORICAL]: "scores-categorical",
};

function validateMetricAggregations(params: {
  view: string;
  metrics: Array<{ measure: string; agg: string }>;
  minVersion?: number;
}): void {
  const version: ViewVersion = (params.minVersion ?? 1) >= 2 ? "v2" : "v1";
  const viewDecl = getViewDeclaration(
    params.view as z.infer<typeof views>,
    version,
  );

  for (const metric of params.metrics) {
    const measureDef = viewDecl.measures[metric.measure];
    if (!measureDef) continue; // measure existence is validated elsewhere
    const validAggs = getValidAggregationsForMeasureType(measureDef.type);
    if (!validAggs.some((a) => a === metric.agg)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Aggregation "${metric.agg}" is not valid for measure "${metric.measure}" (type: ${measureDef.type}). Valid aggregations: ${validAggs.join(", ")}`,
      });
    }
  }
}

export const dashboardWidgetRouter = createTRPCRouter({
  create: protectedProjectProcedure
    .input(CreateDashboardWidgetInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });

      validateMetricAggregations({
        view: input.view,
        metrics: input.metrics,
        minVersion: input.minVersion,
      });

      // Create the widget using the DashboardService
      const widget = await DashboardService.createWidget(
        input.projectId,
        {
          ...input,
          view: viewMapping[input.view],
          minVersion: input.minVersion ?? 1,
        },
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

  get: protectedProjectProcedure
    .input(GetDashboardWidgetInput)
    .query(async ({ ctx, input }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:read",
      });

      const widget = await DashboardService.getWidget(
        input.widgetId,
        input.projectId,
      );

      if (!widget) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Widget not found",
        });
      }

      return {
        ...widget,
        view: reverseViewMapping[widget.view],
        owner: widget.owner,
      };
    }),

  update: protectedProjectProcedure
    .input(UpdateDashboardWidgetInput)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });

      validateMetricAggregations({
        view: input.view,
        metrics: input.metrics,
        minVersion: input.minVersion,
      });

      // Update the widget using the DashboardService
      const widget = await DashboardService.updateWidget(
        input.projectId,
        input.widgetId,
        {
          name: input.name,
          description: input.description,
          view: viewMapping[input.view],
          dimensions: input.dimensions,
          metrics: input.metrics,
          filters: input.filters,
          chartType: input.chartType,
          chartConfig: input.chartConfig,
          minVersion: input.minVersion,
        },
        ctx.session.user?.id,
      );

      return {
        success: true,
        widget,
      };
    }),

  copyToProject: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        widgetId: z.string(),
        dashboardId: z.string(),
        placementId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });

      const newWidgetId = await DashboardService.copyWidgetToProject({
        sourceWidgetId: input.widgetId,
        projectId: input.projectId,
        dashboardId: input.dashboardId,
        placementId: input.placementId,
        userId: ctx.session.user?.id,
      });

      return { widgetId: newWidgetId };
    }),

  // Define delete widget input schema
  delete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        widgetId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "dashboards:CUD",
      });

      try {
        // Delete the widget using the DashboardService
        await DashboardService.deleteWidget(input.widgetId, input.projectId);

        return {
          success: true,
        };
      } catch (error) {
        // If the widget is still referenced in dashboards, throw a CONFLICT error
        if (error instanceof LangfuseConflictError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: error.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (error as Error)?.message,
        });
      }
    }),
});
