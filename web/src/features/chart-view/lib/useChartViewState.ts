import { useCallback, useMemo } from "react";
import { StringParam, useQueryParams, withDefault } from "use-query-params";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  type AggregationFn,
  type ChartViewConfig,
  type DimensionKey,
  type MetricKey,
  type TimeGranularity,
  type ViewMode,
} from "../types";
import { coerceConfig, DEFAULT_CONFIG } from "../vocab";

/**
 * URL-driven, reversible state for the chart view: the table↔chart `viewMode`
 * and the visualization `config`. The URL is the single source of truth (the
 * search-bar pattern) — refresh, deep-link, and browser back all just work, and
 * the toggle is a clean revert. Non-default fields only appear in the URL
 * (`withDefault`), so the common case stays uncluttered. Everything round-trips
 * through `coerceConfig`, so a hand-edited URL can never yield an invalid query.
 */
export function useChartViewState(): {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  config: ChartViewConfig;
  setConfig: (patch: Partial<ChartViewConfig>) => void;
} {
  const [params, setParams] = useQueryParams({
    // Namespaced ("eventsView", not bare "view") to avoid colliding with the
    // trace-peek panel's `view=timeline` param, which shares this router/URL.
    eventsView: withDefault(StringParam, "table"),
    chartMetric: withDefault(StringParam, DEFAULT_CONFIG.metric),
    chartAgg: withDefault(StringParam, DEFAULT_CONFIG.aggregation),
    chartBreakdown: withDefault(StringParam, DEFAULT_CONFIG.breakdown),
    chartType: withDefault(StringParam, DEFAULT_CONFIG.chartType),
    chartGranularity: withDefault(StringParam, DEFAULT_CONFIG.timeGranularity),
  });

  const viewMode: ViewMode = params.eventsView === "chart" ? "chart" : "table";

  const config = useMemo<ChartViewConfig>(
    () =>
      coerceConfig({
        metric: params.chartMetric as MetricKey,
        aggregation: params.chartAgg as AggregationFn,
        breakdown: params.chartBreakdown as DimensionKey,
        chartType: params.chartType as DashboardWidgetChartType,
        timeGranularity: params.chartGranularity as TimeGranularity,
      }),
    [
      params.chartMetric,
      params.chartAgg,
      params.chartBreakdown,
      params.chartType,
      params.chartGranularity,
    ],
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => setParams({ eventsView: mode }),
    [setParams],
  );

  const setConfig = useCallback(
    (patch: Partial<ChartViewConfig>) => {
      const next = coerceConfig({ ...config, ...patch });
      setParams({
        chartMetric: next.metric,
        chartAgg: next.aggregation,
        chartBreakdown: next.breakdown,
        chartType: next.chartType,
        chartGranularity: next.timeGranularity,
      });
    },
    [config, setParams],
  );

  return { viewMode, setViewMode, config, setConfig };
}
