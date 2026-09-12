import { z } from "zod";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

// Client-safe mirror of the Prisma enum. Vite/Storybook resolve shared from
// source and cannot turn `export * from "@prisma/client"` into named ESM
// exports, so browser code must not value-import Prisma enums.
const DASHBOARD_WIDGET_CHART_TYPES = [
  "LINE_TIME_SERIES",
  "AREA_TIME_SERIES",
  "BAR_TIME_SERIES",
  "HORIZONTAL_BAR",
  "VERTICAL_BAR",
  "PIE",
  "NUMBER",
  "HISTOGRAM",
  "PIVOT_TABLE",
] as const satisfies readonly DashboardWidgetChartType[];

export const dashboardWidgetChartTypeSchema = z.enum(
  DASHBOARD_WIDGET_CHART_TYPES,
);
