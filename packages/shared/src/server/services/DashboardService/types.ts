import { DashboardWidgetChartType, DashboardWidgetViews } from "@prisma/client";
import { z } from "zod/v4";
import { singleFilter } from "../../../";

export const BaseTimeSeriesChartConfig = z.object({});
export const BaseTotalValueChartConfig = z.object({
  row_limit: z.number().int().positive().lte(1000).optional(),
});

export const LineChartTimeSeriesConfig = BaseTimeSeriesChartConfig.extend({
  type: z.literal("LINE_TIME_SERIES"),
});
export const BarChartTimeSeriesConfig = BaseTimeSeriesChartConfig.extend({
  type: z.literal("BAR_TIME_SERIES"),
});
export const AreaChartTimeSeriesConfig = BaseTimeSeriesChartConfig.extend({
  type: z.literal("AREA_TIME_SERIES"),
});

export const HorizontalBarChartConfig = BaseTotalValueChartConfig.extend({
  type: z.literal("HORIZONTAL_BAR"),
  show_value_labels: z.boolean().optional(),
});
export const VerticalBarChartConfig = BaseTotalValueChartConfig.extend({
  type: z.literal("VERTICAL_BAR"),
});
export const PieChartConfig = BaseTotalValueChartConfig.extend({
  type: z.literal("PIE"),
});

export const BigNumberChartConfig = BaseTotalValueChartConfig.extend({
  type: z.literal("NUMBER"),
});

export const HistogramChartConfig = BaseTotalValueChartConfig.extend({
  type: z.literal("HISTOGRAM"),
  bins: z.number().int().min(1).max(100).optional().default(10),
});

export const PivotTableChartConfig = BaseTotalValueChartConfig.extend({
  type: z.literal("PIVOT_TABLE"),
  defaultSort: z
    .object({
      column: z.string(),
      order: z.enum(["ASC", "DESC"]),
    })
    .optional(),
});

// Define dimension schema
export const DimensionSchema = z.object({
  field: z.string(),
});

// Define metric schema
export const MetricSchema = z.object({
  measure: z.string(),
  agg: z.string(),
});

// Define chart config schema based on chart type
export const ChartConfigSchema = z.discriminatedUnion("type", [
  LineChartTimeSeriesConfig,
  BarChartTimeSeriesConfig,
  AreaChartTimeSeriesConfig,
  HorizontalBarChartConfig,
  VerticalBarChartConfig,
  PieChartConfig,
  BigNumberChartConfig,
  HistogramChartConfig,
  PivotTableChartConfig,
]);

export const DashboardDefinitionWidgetWidgetSchema = z.object({
  type: z.literal("widget"),
  id: z.string(),
  widgetId: z.string(),
  x: z.number().int().gte(0),
  y: z.number().int().gte(0),
  x_size: z.number().int().positive(),
  y_size: z.number().int().positive(),
});

export const DashboardDefinitionWidgetSchema = z.discriminatedUnion("type", [
  DashboardDefinitionWidgetWidgetSchema,
]);

export const DashboardDefinitionSchema = z.object({
  widgets: z.array(DashboardDefinitionWidgetSchema),
});

export const OwnerEnum = z.enum(["PROJECT", "LANGFUSE"]);

// Define the dashboard domain object
export const DashboardDomainSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  projectId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  definition: DashboardDefinitionSchema,
  filters: z.array(singleFilter).default([]),
  owner: OwnerEnum,
});

// Define the dashboard list response
export const DashboardListResponseSchema = z.object({
  dashboards: z.array(DashboardDomainSchema),
  totalCount: z.number(),
});

// Define the widget domain object
export const WidgetDomainSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  projectId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  view: z.enum(DashboardWidgetViews),
  dimensions: z.array(DimensionSchema),
  metrics: z.array(MetricSchema),
  filters: z.array(singleFilter),
  chartType: z.enum(DashboardWidgetChartType),
  chartConfig: ChartConfigSchema,
  owner: OwnerEnum,
});

// Define create widget input schema
export const CreateWidgetInputSchema = z.object({
  name: z.string().min(1, "Widget name is required"),
  description: z.string(),
  view: z.enum(DashboardWidgetViews),
  dimensions: z.array(DimensionSchema),
  metrics: z.array(MetricSchema),
  filters: z.array(singleFilter),
  chartType: z.enum(DashboardWidgetChartType),
  chartConfig: ChartConfigSchema,
});

// Define the widget list response
export const WidgetListResponseSchema = z.object({
  widgets: z.array(WidgetDomainSchema),
  totalCount: z.number(),
});

// Export types derived from schemas
export type DashboardDomain = z.infer<typeof DashboardDomainSchema>;
export type DashboardListResponse = z.infer<typeof DashboardListResponseSchema>;
export type WidgetDomain = z.infer<typeof WidgetDomainSchema>;
export type CreateWidgetInput = z.infer<typeof CreateWidgetInputSchema>;
export type WidgetListResponse = z.infer<typeof WidgetListResponseSchema>;
