import { useCallback, useMemo } from "react";
import { StringParam, useQueryParams, withDefault } from "use-query-params";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";
import {
  type AggregationFn,
  type ViewMode,
} from "@/src/features/chart-view/types";
import { DEFAULT_SCORE_CHART_CONFIG } from "@/src/features/scores-chart-view/constants/defaultScoreChartConfig";
import { coerceScoreChartConfig } from "@/src/features/scores-chart-view/fns/scoreChartConfig";
import {
  type ScoreChartDataset,
  type ScoreChartViewConfig,
  type ScoreDimensionKey,
  type ScoreMetricKey,
} from "@/src/features/scores-chart-view/types";

const orUndefined = <T>(value: T, fallback: T): T | undefined =>
  value === fallback ? undefined : value;

/**
 * URL-driven table<->chart state for the scores table — same contract as the
 * observations chart view's `useChartViewState`, namespaced under `scores*`
 * so it can't collide with it on a page that renders both (e.g. a trace
 * detail panel).
 */
export function useScoresChartViewState(): {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  config: ScoreChartViewConfig;
  setConfig: (patch: Partial<ScoreChartViewConfig>) => void;
} {
  const [params, setParams] = useQueryParams({
    scoresView: withDefault(StringParam, "table"),
    scoresChartDataset: withDefault(
      StringParam,
      DEFAULT_SCORE_CHART_CONFIG.dataset,
    ),
    scoresChartMetric: withDefault(
      StringParam,
      DEFAULT_SCORE_CHART_CONFIG.metric,
    ),
    scoresChartAgg: withDefault(
      StringParam,
      DEFAULT_SCORE_CHART_CONFIG.aggregation,
    ),
    scoresChartBreakdown: withDefault(
      StringParam,
      DEFAULT_SCORE_CHART_CONFIG.breakdown,
    ),
    scoresChartType: withDefault(
      StringParam,
      DEFAULT_SCORE_CHART_CONFIG.chartType,
    ),
  });

  const viewMode: ViewMode = params.scoresView === "chart" ? "chart" : "table";

  const config = useMemo<ScoreChartViewConfig>(
    () =>
      coerceScoreChartConfig({
        dataset: params.scoresChartDataset as ScoreChartDataset,
        metric: params.scoresChartMetric as ScoreMetricKey,
        aggregation: params.scoresChartAgg as AggregationFn,
        breakdown: params.scoresChartBreakdown as ScoreDimensionKey,
        chartType: params.scoresChartType as DashboardWidgetChartType,
        timeGranularity: DEFAULT_SCORE_CHART_CONFIG.timeGranularity,
      }),
    [
      params.scoresChartDataset,
      params.scoresChartMetric,
      params.scoresChartAgg,
      params.scoresChartBreakdown,
      params.scoresChartType,
    ],
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => setParams({ scoresView: orUndefined(mode, "table") }),
    [setParams],
  );

  const setConfig = useCallback(
    (patch: Partial<ScoreChartViewConfig>) => {
      const next = coerceScoreChartConfig({ ...config, ...patch });
      setParams({
        scoresChartDataset: orUndefined(
          next.dataset,
          DEFAULT_SCORE_CHART_CONFIG.dataset,
        ),
        scoresChartMetric: orUndefined(
          next.metric,
          DEFAULT_SCORE_CHART_CONFIG.metric,
        ),
        scoresChartAgg: orUndefined(
          next.aggregation,
          DEFAULT_SCORE_CHART_CONFIG.aggregation,
        ),
        scoresChartBreakdown: orUndefined(
          next.breakdown,
          DEFAULT_SCORE_CHART_CONFIG.breakdown,
        ),
        scoresChartType: orUndefined(
          next.chartType,
          DEFAULT_SCORE_CHART_CONFIG.chartType,
        ),
      });
    },
    [config, setParams],
  );

  return { viewMode, setViewMode, config, setConfig };
}
