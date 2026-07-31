import { z } from "zod";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { orderBy, singleFilter, optionalPaginationZod } from "@langfuse/shared";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  DashboardService,
  DimensionSchema,
  MetricSchema,
  ChartConfigSchema,
  dashboardWidgetViewToQueryView,
  queryViewToDashboardWidgetView,
} from "@langfuse/shared/src/server";
import { views } from "@langfuse/shared/query";
import { TRPCError } from "@trpc/server";
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
        input.projectId,
        {
          ...input,
          view: queryViewToDashboardWidgetView[input.view],
        },
        ctx.session.user?.id,
        ctx.session.user?.v4BetaEnabled ? 2 : 1,
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
        view: dashboardWidgetViewToQueryView[widget.view],
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

      // Update the widget using the DashboardService
      const widget = await DashboardService.updateWidget(
        input.projectId,
        input.widgetId,
        {
          name: input.name,
          description: input.description,
          view: queryViewToDashboardWidgetView[input.view],
          dimensions: input.dimensions,
          metrics: input.metrics,
          filters: input.filters,
          chartType: input.chartType,
          chartConfig: input.chartConfig,
        },
        ctx.session.user?.id,
        ctx.session.user?.v4BetaEnabled ? 2 : 1,
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
