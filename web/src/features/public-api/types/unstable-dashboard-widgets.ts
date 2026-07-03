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

export const PostUnstableDashboardWidgetBody = z
  .object({
    name: z.string().min(1, "Widget name is required"),
    description: z.string(),
    view: PostUnstableDashboardWidgetView,
    dimensions: z.array(DashboardWidgetDimensionSchema),
    metrics: z.array(DashboardWidgetMetricSchema).min(1),
    filters: z.array(singleFilter),
    chartType: z.enum(DashboardWidgetChartType),
    chartConfig: ChartConfigSchema,
    minVersion: z.number().int().min(2).optional(),
  })
  .superRefine((widget, ctx) => {
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

export type PostUnstableDashboardWidgetBodyType = z.infer<
  typeof PostUnstableDashboardWidgetBody
>;
