import { z } from "zod";
import {
  ChartConfigSchema,
  DashboardWidgetChartType,
  DimensionSchema,
  MetricSchema,
  singleFilter,
} from "@langfuse/shared";
import { metricAggregations } from "@langfuse/shared/query";

export const PostUnstableDashboardWidgetView = z.enum([
  "observations",
  "scores-numeric",
  "scores-categorical",
]);

const DashboardWidgetMetricSchema = MetricSchema.extend({
  measure: z.string().min(1),
  agg: metricAggregations,
});

const DashboardWidgetDimensionSchema = DimensionSchema.extend({
  field: z.string().min(1),
});

const UnstableDashboardWidgetBody = z.object({
  name: z.string().min(1, "Widget name is required"),
  description: z.string(),
  view: PostUnstableDashboardWidgetView,
  dimensions: z.array(DashboardWidgetDimensionSchema),
  metrics: z.array(DashboardWidgetMetricSchema).min(1),
  filters: z.array(singleFilter),
  chartType: z.enum(DashboardWidgetChartType),
  chartConfig: ChartConfigSchema,
  minVersion: z.number().int().min(2).optional(),
});

export const PostUnstableDashboardWidgetBody =
  UnstableDashboardWidgetBody.superRefine((widget, ctx) => {
    if (widget.chartConfig.type !== widget.chartType) {
      ctx.addIssue({
        code: "custom",
        path: ["chartConfig", "type"],
        message: "chartConfig.type must match chartType",
      });
    }
  });

export const PublicDashboardWidget = z
  .object({
    id: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    name: z.string(),
    description: z.string(),
    view: PostUnstableDashboardWidgetView,
    dimensions: z.array(DashboardWidgetDimensionSchema),
    metrics: z.array(DashboardWidgetMetricSchema),
    filters: z.array(singleFilter),
    chartType: z.enum(DashboardWidgetChartType),
    chartConfig: ChartConfigSchema,
    minVersion: z.number().int().min(2),
  })
  .strict();

export const PostUnstableDashboardWidgetResponse = PublicDashboardWidget;

export const GetUnstableDashboardWidgetsQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export const GetUnstableDashboardWidgetsResponse = z.object({
  data: z.array(PublicDashboardWidget),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  }),
});
export const DashboardWidgetIdQuery = z.object({ widgetId: z.string() });
export const GetUnstableDashboardWidgetResponse = PublicDashboardWidget;
export const PatchUnstableDashboardWidgetBody =
  UnstableDashboardWidgetBody.partial().refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );
export const PatchUnstableDashboardWidgetResponse = PublicDashboardWidget;
export const DeleteUnstableDashboardWidgetResponse = z.object({
  message: z.literal("Dashboard widget successfully deleted"),
});

export type PostUnstableDashboardWidgetBodyType = z.infer<
  typeof PostUnstableDashboardWidgetBody
>;
