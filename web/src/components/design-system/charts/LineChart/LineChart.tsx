"use client";

import { type ComponentProps } from "react";

import { SeriesChartCore } from "@/src/components/design-system/internal/charts/SeriesChartCore";

export type {
  LineChartLegend,
  LineChartSeries,
  LineChartThreshold,
} from "@/src/components/design-system/internal/charts/SeriesChartCore";

export function LineChart(
  props: ComponentProps<typeof SeriesChartCore> & {
    areaVariant?: never;
    areaStacked?: never;
  },
) {
  return <SeriesChartCore {...props} />;
}
