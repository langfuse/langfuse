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

export const DashboardWidgetViewOutput = z.enum([
  "observations",
  "scores-numeric",
  "scores-categorical",
  "traces",
]);

const DashboardWidgetMetricSchema = MetricSchema.extend({
  measure: z.string().min(1),
  agg: metricAggregations,
});

const DashboardWidgetDimensionSchema = DimensionSchema.extend({
  field: z.string().min(1),
});

// Input-side chart config: `type` is optional and defaults to the widget's
// chartType; per-type option validation happens in the service after the
// type is resolved.
const DashboardWidgetChartConfigInput = z
  .object({
    type: z.enum(DashboardWidgetChartType).optional(),
  })
  .loose();

const UnstableDashboardWidgetBody = z.object({
  name: z.string().min(1, "Widget name is required"),
  description: z.string(),
  view: PostUnstableDashboardWidgetView,
  dimensions: z.array(DashboardWidgetDimensionSchema),
  metrics: z.array(DashboardWidgetMetricSchema).min(1),
  filters: z.array(singleFilter),
  chartType: z.enum(DashboardWidgetChartType),
  chartConfig: DashboardWidgetChartConfigInput.optional(),
});

export const PostUnstableDashboardWidgetBody =
  UnstableDashboardWidgetBody.extend({
    description: z.string().default(""),
  });

export const PublicDashboardWidget = z
  .object({
    id: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    name: z.string(),
    description: z.string(),
    view: DashboardWidgetViewOutput,
    dimensions: z.array(DashboardWidgetDimensionSchema),
    metrics: z.array(DashboardWidgetMetricSchema),
    filters: z.array(singleFilter),
    chartType: z.enum(DashboardWidgetChartType),
    chartConfig: ChartConfigSchema,
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
export type DashboardWidgetViewOutputType = z.infer<
  typeof DashboardWidgetViewOutput
>;
