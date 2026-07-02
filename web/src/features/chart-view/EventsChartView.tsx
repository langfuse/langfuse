import React, { useCallback, useMemo } from "react";
import { type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type ChartViewConfig, type TimeGranularity } from "./types";
import { isTimeSeriesChartType } from "./vocab";
import {
  buildChartQuery,
  rowsToDataPoints,
  toChartFilters,
} from "./lib/buildChartQuery";
import { ChartViewPanel } from "./components/ChartViewPanel";
import { GranularitySelect } from "./components/ConfigControls";
import { AskAiChartBar } from "./components/AskAiChartBar";
import { AddToDashboardButton } from "./components/AddToDashboardButton";

/**
 * Production chart view for the v4 events table. Builds the observations
 * aggregate query from the same filters + time window the table is showing,
 * runs it through the existing `dashboard.executeQuery` (the v2 / events read
 * path), and renders the Take-B panel. The query is the only difference from
 * the Storybook harness — everything below `ChartViewPanel` is shared, view-only.
 */
export function EventsChartView({
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
  config: ChartViewConfig;
  onConfigChange: (patch: Partial<ChartViewConfig>) => void;
}) {
  const filters = useMemo(() => toChartFilters(filterState), [filterState]);

  const query = useMemo(
    () => buildChartQuery({ config, filters, fromTimestamp, toTimestamp }),
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
    () => (queryResult.data ? rowsToDataPoints(queryResult.data, config) : []),
    [queryResult.data, config],
  );

  const error = !validRange
    ? "Pick a wider time range to chart."
    : queryResult.isError
      ? (queryResult.error?.message ??
        "Couldn't build a chart for the current view.")
      : null;

  // Mirror the search-bar "Ask AI" gate (Cloud + org AI features) AND the
  // server's RBAC scope (`prompts:CUD`), so a VIEWER who can't call the endpoint
  // never sees a dead affordance. The server enforces all of this too.
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { organization } = useQueryProject();
  const hasAiAccess = useHasProjectAccess({ projectId, scope: "prompts:CUD" });
  const aiAvailable =
    isLangfuseCloud && Boolean(organization?.aiFeaturesEnabled) && hasAiAccess;

  // Ask-AI emits a full spec — apply it as a complete replacement (coerced).
  const applyAiConfig = useCallback(
    (next: ChartViewConfig) => onConfigChange(next),
    [onConfigChange],
  );
  const onGranularity = useCallback(
    (timeGranularity: TimeGranularity) => onConfigChange({ timeGranularity }),
    [onConfigChange],
  );

  return (
    <ChartViewPanel
      config={config}
      onConfigChange={onConfigChange}
      data={data}
      isLoading={validRange && queryResult.isPending && !queryResult.isError}
      error={error}
      chartActions={
        <AddToDashboardButton
          projectId={projectId}
          config={config}
          filters={filters}
        />
      }
      aiSlot={
        aiAvailable ? (
          <AskAiChartBar projectId={projectId} onApply={applyAiConfig} />
        ) : undefined
      }
      granularitySlot={
        <GranularitySelect
          value={config.timeGranularity}
          onChange={onGranularity}
          disabled={!isTimeSeriesChartType(config.chartType)}
        />
      }
    />
  );
}
