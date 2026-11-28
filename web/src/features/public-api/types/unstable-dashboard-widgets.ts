import { z } from "zod";
import {
  ChartConfigSchema,
  widgetDefinitionSchema,
  DashboardWidgetChartType,
  DimensionSchema,
  MetricSchema,
  singleFilterList,
} from "@langfuse/shared";
import { metricAggregations } from "@langfuse/shared/query";

export const PostUnstableDashboardWidgetView = z.enum([
  "observations",
  "scores-numeric",
  "scores-boolean",
  "scores-categorical",
]);

const DashboardWidgetViewOutput = z.enum([
  "observations",
  "scores-numeric",
  "scores-boolean",
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

export const ClassicDashboardWidgetBody = z.object({
  name: z.string().min(1, "Widget name is required"),
  description: z.string(),
  view: PostUnstableDashboardWidgetView,
  dimensions: z.array(DashboardWidgetDimensionSchema),
  metrics: z.array(DashboardWidgetMetricSchema).min(1),
  filters: singleFilterList,
  chartType: z.enum(DashboardWidgetChartType),
  chartConfig: DashboardWidgetChartConfigInput.optional(),
});

// Reject read-only content before the classic schema strips unknown fields.
const classicWrite = z
  .unknown()
  .refine(
    (input) =>
      !(
        input &&
        typeof input === "object" &&
        Object.hasOwn(input, "definition")
      ),
    { path: ["definition"], message: "Widget definition is read-only" },
  );
export const PostUnstableDashboardWidgetBody = classicWrite.pipe(
  ClassicDashboardWidgetBody.extend({ description: z.string().default("") }),
);

const PublicDashboardWidget = z
  .object({
    id: z.string(),
    invalid: z.literal(false).optional(),
    definition: widgetDefinitionSchema.nullish(),
    revision: z.number().int().nonnegative().optional(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    name: z.string(),
    description: z.string(),
    view: DashboardWidgetViewOutput,
    dimensions: z.array(DashboardWidgetDimensionSchema),
    metrics: z.array(DashboardWidgetMetricSchema),
    filters: singleFilterList,
    chartType: z.enum(DashboardWidgetChartType),
    chartConfig: ChartConfigSchema,
  })
  .strict();

/** @alias */
export const PostUnstableDashboardWidgetResponse = PublicDashboardWidget;

export const GetUnstableDashboardWidgetsQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export const GetUnstableDashboardWidgetResponse = z.discriminatedUnion(
  "invalid",
  [
    PublicDashboardWidget,
    PublicDashboardWidget.extend({
      invalid: z.literal(true),
      revision: z.number().int().optional(),
      view: z.string(),
      chartType: z.string(),
      definition: z.unknown(),
      dimensions: z.unknown(),
      metrics: z.unknown(),
      filters: z.unknown(),
      chartConfig: z.unknown(),
    }),
  ],
);
export const GetUnstableDashboardWidgetsResponse = z.object({
  data: z.array(GetUnstableDashboardWidgetResponse),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  }),
});
export const DashboardWidgetIdQuery = z.object({ widgetId: z.string() });
export const PatchUnstableDashboardWidgetBody = classicWrite.pipe(
  ClassicDashboardWidgetBody.partial().refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  ),
);
/** @alias */
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
