import { useCallback, useMemo } from "react";
import { StringParam, useQueryParams, withDefault } from "use-query-params";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  type AggregationFn,
  type ChartViewConfig,
  type DimensionKey,
  type MetricKey,
  type ViewMode,
} from "../types";
import { coerceConfig, DEFAULT_CONFIG } from "../vocab";

/**
 * Returns `undefined` for a value equal to its default. Writing `undefined`
 * removes the param, so default values never land in the URL (read-side
 * `withDefault` only strips on read, not on write).
 */
const orUndefined = <T>(value: T, fallback: T): T | undefined =>
  value === fallback ? undefined : value;

/**
 * URL-driven, reversible state for the chart view: the table↔chart `viewMode`
 * and the visualization `config`. The URL is the single source of truth (the
 * search-bar pattern) — refresh, deep-link, and browser back all just work, and
 * the toggle is a clean revert. Only non-default fields are written to the URL
 * (see `orUndefined`), so the common case stays uncluttered. Everything
 * round-trips through `coerceConfig`, so a hand-edited URL can never yield an
 * invalid query.
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
  });

  const viewMode: ViewMode = params.eventsView === "chart" ? "chart" : "table";

  const config = useMemo<ChartViewConfig>(
    () =>
      coerceConfig({
        metric: params.chartMetric as MetricKey,
        aggregation: params.chartAgg as AggregationFn,
        breakdown: params.chartBreakdown as DimensionKey,
        chartType: params.chartType as DashboardWidgetChartType,
        // Granularity is not user-controllable in production — the chart (and
        // any widget it becomes) always renders auto buckets. Keep the default
        // so `coerceConfig` yields a complete config.
        timeGranularity: DEFAULT_CONFIG.timeGranularity,
      }),
    [
      params.chartMetric,
      params.chartAgg,
      params.chartBreakdown,
      params.chartType,
    ],
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => setParams({ eventsView: orUndefined(mode, "table") }),
    [setParams],
  );

  const setConfig = useCallback(
    (patch: Partial<ChartViewConfig>) => {
      const next = coerceConfig({ ...config, ...patch });
      setParams({
        chartMetric: orUndefined(next.metric, DEFAULT_CONFIG.metric),
        chartAgg: orUndefined(next.aggregation, DEFAULT_CONFIG.aggregation),
        chartBreakdown: orUndefined(next.breakdown, DEFAULT_CONFIG.breakdown),
        chartType: orUndefined(next.chartType, DEFAULT_CONFIG.chartType),
      });
    },
    [config, setParams],
  );

  return { viewMode, setViewMode, config, setConfig };
}
