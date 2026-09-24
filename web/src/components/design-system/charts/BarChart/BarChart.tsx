"use client";

import { type ComponentProps } from "react";

import { BarChartCore } from "@/src/components/design-system/internal/charts/BarChartCore";

export type { BarChartDatum } from "@/src/components/design-system/internal/charts/BarChartCore";

type BarChartProps = Omit<ComponentProps<typeof BarChartCore>, "barSpacing">;

export function BarChart(props: BarChartProps) {
  return <BarChartCore {...props} barSpacing="default" />;
}
