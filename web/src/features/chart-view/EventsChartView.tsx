import React, { useMemo } from "react";
import { type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { type ChartViewConfig } from "./types";
import {
  buildChartQuery,
  rowsToDataPoints,
  toChartFilters,
} from "./lib/buildChartQuery";
import { ChartViewPanel } from "./components/ChartViewPanel";

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

  const queryResult = api.dashboard.executeQuery.useQuery(
    { projectId, query, version: "v2" },
    {
      enabled: fromTimestamp < toTimestamp,
      meta: { silentHttpCodes: [422] },
      trpc: { context: { skipBatch: true } },
    },
  );

  const data = useMemo(
    () => (queryResult.data ? rowsToDataPoints(queryResult.data, config) : []),
    [queryResult.data, config],
  );

  const error = queryResult.isError
    ? (queryResult.error?.message ??
      "Couldn't build a chart for the current view.")
    : null;

  return (
    <ChartViewPanel
      config={config}
      onConfigChange={onConfigChange}
      data={data}
      isLoading={queryResult.isPending && !queryResult.isError}
      error={error}
    />
  );
}
