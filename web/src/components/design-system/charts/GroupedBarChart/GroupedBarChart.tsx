"use client";

import {
  BarChartCore,
  type MultiSeriesBarChartCoreProps,
} from "@/src/components/design-system/internal/charts/BarChartCore";

export function GroupedBarChart(
  props: Omit<MultiSeriesBarChartCoreProps, "layout">,
) {
  return <BarChartCore {...props} layout="grouped" />;
}
