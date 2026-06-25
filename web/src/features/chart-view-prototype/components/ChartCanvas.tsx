import React, { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { type ChartViewConfig, type PrototypeEvent } from "../types";
import { getMetric, isTimeSeriesChartType } from "../vocab";
import { aggregateEvents, buildChartConfig } from "../lib/aggregate";

const RANKED_ROW_LIMIT = 12;

/**
 * View-only chart renderer: derives `DataPoint[]` from the raw events + config
 * (pure, memoized) and hands them to the shared `chart-library`. Memoized so a
 * config change to one field, or a parent re-render, doesn't re-aggregate or
 * re-render the chart unless its inputs actually change — the render boundary
 * the large-feature playbook asks for.
 */
function ChartCanvasInner({
  events,
  config,
}: {
  events: PrototypeEvent[];
  config: ChartViewConfig;
}) {
  const metric = getMetric(config.metric);
  const data = useMemo(() => aggregateEvents(events, config), [events, config]);
  const chartConfig = useMemo(
    () => buildChartConfig(data, metric.label),
    [data, metric.label],
  );

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <BarChart3 className="h-10 w-10 opacity-40" />
        <p className="text-sm">No events match the current filters.</p>
      </div>
    );
  }

  const isTimeSeries = isTimeSeriesChartType(config.chartType);
  const legendPosition =
    isTimeSeries && config.breakdown !== "none" ? "above" : "none";

  return (
    <Chart
      chartType={config.chartType}
      data={data}
      rowLimit={RANKED_ROW_LIMIT}
      chartConfig={{ type: config.chartType, unit: metric.unit }}
      config={chartConfig}
      legendPosition={legendPosition}
    />
  );
}

export const ChartCanvas = React.memo(ChartCanvasInner);
