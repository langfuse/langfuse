import { z } from "zod";
import { DashboardWidgetChartType, DashboardWidgetViews } from "../../../db";
import { singleFilter } from "../../../";

export const BaseTimeSeriesChartConfig = z.object({});
export const BaseTotalValueChartConfig = z.object({
  row_limit: z.number().int().positive().lte(1000).optional(),
});

export const LineChartTimeSeriesConfig = BaseTimeSeriesChartConfig;
export const BarChartTimeSeriesConfig = BaseTimeSeriesChartConfig;

export const HorizontalBarChartConfig = BaseTotalValueChartConfig;
export const VerticalBarChartConfig = BaseTotalValueChartConfig;
export const PieChartConfig = BaseTotalValueChartConfig;

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
export const ChartConfigSchema = z.record(z.any());

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
  view: z.nativeEnum(DashboardWidgetViews),
  dimensions: z.array(DimensionSchema),
  metrics: z.array(MetricSchema),
  filters: z.array(singleFilter),
  chartType: z.nativeEnum(DashboardWidgetChartType),
  chartConfig: ChartConfigSchema,
});

// Define create widget input schema
export const CreateWidgetInputSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Widget name is required"),
  description: z.string(),
  view: z.nativeEnum(DashboardWidgetViews),
  dimensions: z.array(DimensionSchema),
  metrics: z.array(MetricSchema),
  filters: z.array(singleFilter),
  chartType: z.nativeEnum(DashboardWidgetChartType),
  chartConfig: ChartConfigSchema,
});

// Define the widget list response
export const WidgetListResponseSchema = z.object({
  widgets: z.array(WidgetDomainSchema),
  totalCount: z.number(),
});

// Export types derived from schemas
export type WidgetDomain = z.infer<typeof WidgetDomainSchema>;
export type CreateWidgetInput = z.infer<typeof CreateWidgetInputSchema>;
export type WidgetListResponse = z.infer<typeof WidgetListResponseSchema>;
