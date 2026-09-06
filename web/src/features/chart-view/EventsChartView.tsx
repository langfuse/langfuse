import React, { useCallback, useMemo } from "react";
import { type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { type ChartViewConfig } from "./types";
import { buildChartQuery, rowsToDataPoints } from "./lib/buildChartQuery";
import { chartConfigToWidgetInput } from "./lib/chartConfigToWidget";
import { toChartFilters } from "./lib/chartFilterCompatibility";
import { ChartViewPanel } from "./components/ChartViewPanel";
import { AddToDashboardButton } from "./components/AddToDashboardButton";
import { type ChartDescriptionFormatter } from "./vocab";
import { useTranslations } from "next-intl";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

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
  const t = useTranslations("evaluationAnalytics.chartView");
  const labelsT = useTranslations("systemUi.chartControls");
  const formatDescription = useCallback<ChartDescriptionFormatter>(
    (key, values) => labelsT(key as Parameters<typeof labelsT>[0], values),
    [labelsT],
  );
  const canManageDashboards = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });
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
      meta: { silentHttpCodes: [412, 422] },
      trpc: { context: { skipBatch: true } },
    },
  );

  const data = useMemo(
    () => (queryResult.data ? rowsToDataPoints(queryResult.data, config) : []),
    [queryResult.data, config],
  );

  const error = !validRange
    ? t("widerRange")
    : queryResult.isError
      ? (queryResult.error?.message ?? t("buildFailed"))
      : null;

  const widgetInput = useMemo(
    () => chartConfigToWidgetInput({ config, filters, formatDescription }),
    [config, filters, formatDescription],
  );

  return (
    <ChartViewPanel
      config={config}
      onConfigChange={onConfigChange}
      data={data}
      isLoading={validRange && queryResult.isPending && !queryResult.isError}
      error={error}
      chartActions={
        canManageDashboards && (
          <AddToDashboardButton
            projectId={projectId}
            widgetInput={widgetInput}
          />
        )
      }
    />
  );
}
