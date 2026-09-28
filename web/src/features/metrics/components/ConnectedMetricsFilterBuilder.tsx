import { type FilterState, type TimeFilter } from "@langfuse/shared";
import { type views, type ViewVersion } from "@langfuse/shared/query";
import { type z } from "zod";
import { api } from "@/src/utils/api";
import { useMetadataValueOptions } from "@/src/features/events";
import {
  getMetricsColumnsWithCustomSelect,
  getMetricsFilterColumns,
} from "@/src/features/metrics/metricsFilterColumns";
import {
  MetricsFilterBuilder,
  buildV1FilterColumnsParams,
  buildV2FilterColumnsParams,
  type EventFilterOptionsColumn,
} from "./MetricsFilterBuilder";

const v1FilterOptionsQueryConfig = {
  trpc: { context: { skipBatch: true } },
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: Infinity,
} as const;

const v2FilterOptionsQueryConfig = {
  trpc: { context: { skipBatch: true } },
  staleTime: 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

/** eventsFilterOptionsColumns lists the v2 facets fast enough to load in one request. */
const eventsFilterOptionsColumns = [
  "providedModelName",
  "modelId",
  "name",
  "promptName",
  "traceTags",
  "traceName",
  "type",
  "userId",
  "version",
  "release",
  "sessionId",
  "level",
  "environment",
  "ingestionApiKey",
  "experimentDatasetId",
  "experimentId",
  "experimentName",
  "isRootObservation",
  "calledToolNames",
  "metadataKeys",
  "scores_avg",
  "score_categories",
  "score_booleans",
  "trace_scores_avg",
  "trace_score_categories",
  "trace_score_booleans",
] satisfies EventFilterOptionsColumn[];

/** slowEventsFilterOptionsColumns lists the v2 facets that scan slowly enough to need their own request. */
const slowEventsFilterOptionsColumns = [
  "toolNames",
] satisfies EventFilterOptionsColumn[];

type MetricsFilterDateRange = { from: Date; to?: Date };

type MetricsFilterFetcherProps = {
  view: z.infer<typeof views>;
  projectId: string;
  dateRange?: MetricsFilterDateRange;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
};

/** Fetch filter options separately so the editor can render with fixture data. */
export function useMetricsFilterBuilderData({
  version,
  view,
  projectId,
  dateRange,
  filters,
}: Omit<MetricsFilterFetcherProps, "onChange"> & { version: ViewVersion }) {
  const isV1 = version === "v1";
  const evaluatorOptions = api.evalsV2.options.useQuery(
    { projectId, limit: 100 },
    v2FilterOptionsQueryConfig,
  );
  const evaluatorNameOptions =
    evaluatorOptions.data?.map(({ id, name }) => ({
      value: id,
      displayValue: name,
    })) ?? [];
  const startTimeFilter = metricsFilterTimeFilter("startTime", dateRange);
  const traceFilterOptions = api.traces.filterOptions.useQuery(
    {
      projectId,
      timestampFilter: metricsFilterTimeFilter("timestamp", dateRange),
    },
    { ...v1FilterOptionsQueryConfig, enabled: isV1 },
  );
  const generationsFilterOptions = api.generations.filterOptions.useQuery(
    { projectId, startTimeFilter, observationType: "ALL" },
    { ...v1FilterOptionsQueryConfig, enabled: isV1 },
  );
  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      { projectId, fromTimestamp: dateRange?.from },
      { ...v1FilterOptionsQueryConfig, enabled: isV1 },
    );
  const eventsFilterOptions = api.events.filterOptions.useQuery(
    { projectId, startTimeFilter, columns: eventsFilterOptionsColumns },
    { ...v2FilterOptionsQueryConfig, enabled: !isV1 },
  );
  const slowEventsFilterOptions = api.events.filterOptions.useQuery(
    { projectId, startTimeFilter, columns: slowEventsFilterOptionsColumns },
    { ...v2FilterOptionsQueryConfig, enabled: !isV1 },
  );
  const datasets = api.datasets.allDatasetMeta.useQuery(
    { projectId },
    { enabled: !isV1 },
  );
  const { metadataValueOptions, onMetadataKeyChange } = useMetadataValueOptions(
    {
      projectId,
      filterState: filters,
      startTimeFilter,
      enabled: !isV1,
    },
  );

  if (isV1) {
    const params = buildV1FilterColumnsParams({
      view,
      traceFilterOptions: traceFilterOptions.data,
      generationsFilterOptions: generationsFilterOptions.data,
      environmentFilterOptions: environmentFilterOptions.data,
      evaluatorOptions: evaluatorNameOptions,
    });
    return {
      columns: getMetricsFilterColumns(params),
      columnsWithCustomSelect: getMetricsColumnsWithCustomSelect(params),
      stringObjectValueOptions: undefined,
      onStringObjectKeyChange: undefined,
    };
  }
  const params = buildV2FilterColumnsParams({
    view,
    filterOptions: eventsFilterOptions.data,
    slowFilterOptions: slowEventsFilterOptions.data,
    datasets: datasets.data,
    evaluatorOptions: evaluatorNameOptions,
    metadataKeys: eventsFilterOptions.data?.metadataKeys?.map(
      (row) => row.value,
    ),
  });
  return {
    columns: getMetricsFilterColumns(params),
    columnsWithCustomSelect: getMetricsColumnsWithCustomSelect(params),
    stringObjectValueOptions: metadataValueOptions,
    onStringObjectKeyChange: onMetadataKeyChange,
  };
}

/** Connected filter builder for existing callers. */
export function ConnectedMetricsFilterBuilder({
  version,
  view,
  projectId,
  dateRange,
  filters,
  onChange,
}: MetricsFilterFetcherProps & { version: ViewVersion }) {
  const data = useMetricsFilterBuilderData({
    version,
    view,
    projectId,
    dateRange,
    filters,
  });
  return (
    <MetricsFilterBuilder
      view={view}
      filters={filters}
      onChange={onChange}
      {...data}
    />
  );
}

/** metricsFilterTimeFilter keys a {from, to?} range to a column as the TimeFilter[] the filter-options endpoints expect. */
const metricsFilterTimeFilter = (
  column: "timestamp" | "startTime",
  dateRange?: MetricsFilterDateRange,
): TimeFilter[] | undefined => {
  if (!dateRange) return undefined;
  const filters: TimeFilter[] = [
    { column, type: "datetime", operator: ">=", value: dateRange.from },
  ];
  if (dateRange.to) {
    filters.push({
      column,
      type: "datetime",
      operator: "<=",
      value: dateRange.to,
    });
  }
  return filters;
};
