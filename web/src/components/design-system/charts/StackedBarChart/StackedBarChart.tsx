"use client";

import {
  BarChartCore,
  type MultiSeriesBarChartCoreProps,
} from "@/src/components/design-system/internal/charts/BarChartCore";

export function StackedBarChart(
  props: Omit<MultiSeriesBarChartCoreProps, "layout">,
) {
  return <BarChartCore {...props} layout="stacked" />;
}
