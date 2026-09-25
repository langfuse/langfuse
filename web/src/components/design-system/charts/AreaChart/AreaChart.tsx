"use client";

import { type ComponentProps } from "react";

import { SeriesChartCore } from "@/src/components/design-system/internal/charts/SeriesChartCore";

export function AreaChart(
  props: ComponentProps<typeof SeriesChartCore> & {
    stacked?: boolean;
    areaVariant?: never;
    areaStacked?: never;
  },
) {
  return (
    <SeriesChartCore
      {...props}
      areaVariant
      areaStacked={props.stacked ?? false}
    />
  );
}
