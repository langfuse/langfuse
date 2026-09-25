"use client";

import {
  BarChartCore,
  type SingleBarChartCoreProps,
} from "@/src/components/design-system/internal/charts/BarChartCore";

type HistogramChartProps = Omit<
  SingleBarChartCoreProps,
  "barSpacing" | "layout"
>;

export function HistogramChart(props: HistogramChartProps) {
  return <BarChartCore {...props} layout="single" barSpacing="histogram" />;
}
