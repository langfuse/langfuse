import React, { useMemo } from "react";
import { type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { VIEW_BY_DATASET } from "@/src/features/scores-chart-view/constants/viewByDataset";
import {
  buildScoresChartQuery,
  scoreChartConfigToWidgetInput,
  scoreRowsToDataPoints,
} from "@/src/features/scores-chart-view/fns/scoreChartConfig";
import { type ScoreChartViewConfig } from "@/src/features/scores-chart-view/types";
import { ScoreChartViewPanel } from "@/src/features/scores-chart-view/components/ScoreChartViewPanel/ScoreChartViewPanel";
// Shared with the observations chart view; only the widget-input mapper
// passed to it (`scoreChartConfigToWidgetInput`) is scores-specific.
import { AddToDashboardButton } from "@/src/features/chart-view/components/AddToDashboardButton";

/**
 * Production chart view for the scores table. Mirrors `EventsChartView` (the
 * observations chart view): builds the aggregate query from the same filters
 * + time window the table is showing, runs it through `dashboard.executeQuery`
 * — the same read path the "Scores" dashboard widgets use — and renders the
 * shared chart panel.
 *
 * `filterState` is mapped onto the config's dataset view (`scores-numeric`,
 * `scores-boolean`, or `scores-categorical`) via the existing
 * `mapLegacyUiTableFilterToView` helper (the same one
 * `ChartScores`/`CategoricalScoreChart` use), so a
 * scores-table filter that has no dimension on that view (e.g. the numeric
 * "Value" range, which is a measure, not a filterable dimension) is silently
 * dropped from the chart query rather than erroring — it keeps narrowing the
 * table underneath.
 */
export function ScoresChartView({
  projectId,
  filterState,
  fromTimestamp,
  toTimestamp,
  config,
  onConfigChange,
}: {
  projectId: string;
  filterState: FilterState;
  fromTimestamp: Date;
  toTimestamp: Date;
  config: ScoreChartViewConfig;
  onConfigChange: (patch: Partial<ScoreChartViewConfig>) => void;
}) {
  const filters = useMemo(
    () =>
      mapLegacyUiTableFilterToView(
        VIEW_BY_DATASET[config.dataset],
        filterState,
      ),
    [filterState, config.dataset],
  );

  const query = useMemo(
    () =>
      buildScoresChartQuery({ config, filters, fromTimestamp, toTimestamp }),
    [config, filters, fromTimestamp, toTimestamp],
  );

  // A degenerate window (from === to, or from > to from independent time picks)
  // can't be charted; the query is disabled, which react-query keeps at
  // isPending forever — so surface a hint instead of an endless spinner.
  const validRange = fromTimestamp < toTimestamp;

  const queryResult = api.dashboard.executeQuery.useQuery(
    { projectId, query, version: "v2" },
    {
      enabled: validRange,
      meta: { silentHttpCodes: [422] },
      trpc: { context: { skipBatch: true } },
    },
  );

  const data = useMemo(
    () =>
      queryResult.data ? scoreRowsToDataPoints(queryResult.data, config) : [],
    [queryResult.data, config],
  );

  const error = !validRange
    ? "Pick a wider time range to chart."
    : queryResult.isError
      ? (queryResult.error?.message ??
        "Couldn't build a chart for the current view.")
      : null;

  const widgetInput = useMemo(
    () => scoreChartConfigToWidgetInput({ config, filters }),
    [config, filters],
  );

  return (
    <ScoreChartViewPanel
      config={config}
      onConfigChange={onConfigChange}
      data={data}
      isLoading={validRange && queryResult.isPending && !queryResult.isError}
      error={error}
      chartActions={
        <AddToDashboardButton projectId={projectId} widgetInput={widgetInput} />
      }
    />
  );
}
