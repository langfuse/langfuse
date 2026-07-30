import { z } from "zod";
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
  getValidAggregationsForMeasureType,
  getViewDeclaration,
  resolveWidgetMinVersion,
  views,
  type ViewVersion,
} from "@langfuse/shared/query";
import { TRPCError } from "@trpc/server";
import { LangfuseConflictError } from "@langfuse/shared";
import { deploymentMinWidgetVersion } from "@/src/features/widgets/server/widget-version";

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
  "scores-boolean": DashboardWidgetViews.SCORES_BOOLEAN,
  "scores-categorical": DashboardWidgetViews.SCORES_CATEGORICAL,
};

// Reverse mapping for client-side use
const reverseViewMapping: Record<
  DashboardWidgetViews,
  z.infer<typeof views>
> = {
  [DashboardWidgetViews.TRACES]: "traces",
  [DashboardWidgetViews.OBSERVATIONS]: "observations",
  [DashboardWidgetViews.SCORES_NUMERIC]: "scores-numeric",
  [DashboardWidgetViews.SCORES_BOOLEAN]: "scores-boolean",
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

function validateUiHiddenDimensions(params: {
  view: string;
  dimensions: Array<{ field: string }>;
  minVersion?: number;
}): void {
  const version: ViewVersion = (params.minVersion ?? 1) >= 2 ? "v2" : "v1";
  const viewDecl = getViewDeclaration(
    params.view as z.infer<typeof views>,
    version,
  );

  const hiddenDims = params.dimensions.filter(
    (dim) => viewDecl.dimensions[dim.field]?.uiHidden,
  );
  if (hiddenDims.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Dimensions not available for widgets: ${hiddenDims.map((d) => d.field).join(", ")}`,
    });
  }
}

function validateWidgetVersionAvailability(params: {
  view: string;
  dimensions: Array<{ field: string }>;
  metrics: Array<{ measure: string }>;
  filters: Array<{ column: string }>;
  minVersion?: number;
}): number {
  const shape = {
    view: params.view,
    dimensions: params.dimensions,
    measures: params.metrics,
    filters: params.filters,
  };
  const effectiveMinVersion = resolveWidgetMinVersion({
    ...shape,
    requestedMinVersion: params.minVersion,
  });

  if (deploymentMinWidgetVersion() < 2 && effectiveMinVersion >= 2) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This widget uses v2-only fields, but the current deployment only supports legacy widget queries",
    });
  }

  return effectiveMinVersion;
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

      const effectiveMinVersion = validateWidgetVersionAvailability(input);

      validateMetricAggregations({
        view: input.view,
        metrics: input.metrics,
        minVersion: effectiveMinVersion,
      });

      validateUiHiddenDimensions({
        view: input.view,
        dimensions: input.dimensions,
        minVersion: effectiveMinVersion,
      });

      // Create the widget using the DashboardService
      const widget = await DashboardService.createWidget(
        input.projectId,
        {
          ...input,
          view: viewMapping[input.view],
          minVersion: effectiveMinVersion,
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
        metrics: widget.metrics,
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

      const existingWidget = await DashboardService.getWidget(
        input.widgetId,
        input.projectId,
      );
      const effectiveMinVersion = validateWidgetVersionAvailability({
        ...input,
        minVersion: input.minVersion ?? existingWidget?.minVersion,
      });

      validateMetricAggregations({
        view: input.view,
        metrics: input.metrics,
        minVersion: effectiveMinVersion,
      });

      validateUiHiddenDimensions({
        view: input.view,
        dimensions: input.dimensions,
        minVersion: effectiveMinVersion,
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
          minVersion: effectiveMinVersion,
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

      const sourceWidget = await DashboardService.getWidget(
        input.widgetId,
        input.projectId,
      );
      if (sourceWidget) {
        validateWidgetVersionAvailability({
          view: reverseViewMapping[sourceWidget.view],
          dimensions: sourceWidget.dimensions,
          metrics: sourceWidget.metrics,
          filters: sourceWidget.filters,
          minVersion: sourceWidget.minVersion,
        });
      }

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
