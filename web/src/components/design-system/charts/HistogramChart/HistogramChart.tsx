"use client";

import { type ComponentProps } from "react";

import { BarChartCore } from "@/src/components/design-system/internal/charts/BarChartCore";

type HistogramChartProps = Omit<
  ComponentProps<typeof BarChartCore>,
  "barSpacing"
>;

export function HistogramChart(props: HistogramChartProps) {
  return <BarChartCore {...props} barSpacing="histogram" />;
}
