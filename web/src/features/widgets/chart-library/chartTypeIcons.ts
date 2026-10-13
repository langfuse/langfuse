import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  AreaChart,
  BarChart,
  BarChart3,
  BarChartHorizontal,
  Hash,
  LineChart,
  PieChart,
  Table,
  type LucideIcon,
} from "lucide-react";

export const dashboardWidgetChartTypeIcons: Record<
  DashboardWidgetChartType,
  LucideIcon
> = {
  LINE_TIME_SERIES: LineChart,
  AREA_TIME_SERIES: AreaChart,
  BAR_TIME_SERIES: BarChart,
  HORIZONTAL_BAR: BarChartHorizontal,
  VERTICAL_BAR: BarChart,
  PIE: PieChart,
  NUMBER: Hash,
  HISTOGRAM: BarChart3,
  PIVOT_TABLE: Table,
};
