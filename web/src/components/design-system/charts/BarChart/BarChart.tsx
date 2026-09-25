"use client";

import {
  BarChartCore,
  type SingleBarChartCoreProps,
} from "@/src/components/design-system/internal/charts/BarChartCore";

export type { BarChartDatum } from "@/src/components/design-system/internal/charts/BarChartCore";

type BarChartProps = Omit<SingleBarChartCoreProps, "barSpacing" | "layout">;

export function BarChart(props: BarChartProps) {
  return <BarChartCore {...props} layout="single" barSpacing="default" />;
}
