import {
  ObservationLevelDomain,
  ObservationTypeDomain,
} from "@langfuse/shared";

import { api, type RouterOutputs } from "@/src/utils/api";
import { normalizeSingleValueOptions } from "@/src/features/filters/lib/filter-transform";
import {
  getMetricsColumnsWithCustomSelect,
  getMetricsFilterColumns,
  type GetMetricsFilterColumnsParams,
} from "@/src/features/metrics/metricsFilterColumns";

import {
  metricsFilterTimeFilter,
  type MetricsFilterFetcherProps,
} from "./MetricsFilterBuilder";
import { MetricsFilterView } from "./MetricsFilterView";

const observationLevelOptions = ObservationLevelDomain.options.map((value) => ({
  value,
}));
const observationTypeOptions = ObservationTypeDomain.options.map((value) => ({
  value,
}));

const filterOptionsQueryConfig = {
  trpc: { context: { skipBatch: true } },
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: Infinity,
} as const;

/** MetricsFilterBuilderV1 loads the v1 (traces + generations + project) filter options and renders the filter view. */
export const MetricsFilterBuilderV1 = ({
  view,
  projectId,
  dateRange,
  filters,
  onChange,
}: MetricsFilterFetcherProps) => {
  const traceFilterOptions = api.traces.filterOptions.useQuery(
    {
      projectId,
      timestampFilter: metricsFilterTimeFilter("timestamp", dateRange),
    },
    filterOptionsQueryConfig,
  );

  const generationsFilterOptions = api.generations.filterOptions.useQuery(
    {
      projectId,
      startTimeFilter: metricsFilterTimeFilter("startTime", dateRange),
      observationType: "ALL",
    },
    filterOptionsQueryConfig,
  );

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      { projectId, fromTimestamp: dateRange?.from },
      filterOptionsQueryConfig,
    );

  const params = buildV1FilterColumnsParams({
    view,
    traceFilterOptions: traceFilterOptions.data,
    generationsFilterOptions: generationsFilterOptions.data,
    environmentFilterOptions: environmentFilterOptions.data,
  });

  return (
    <MetricsFilterView
      view={view}
      columns={getMetricsFilterColumns(params)}
      columnsWithCustomSelect={getMetricsColumnsWithCustomSelect(params)}
      filters={filters}
      onChange={onChange}
    />
  );
};

/** buildV1FilterColumnsParams assembles the metric filter column options from the v1 endpoints; v1 keeps plain-string columns, so the events-only suggestion lists stay empty. */
const buildV1FilterColumnsParams = ({
  view,
  traceFilterOptions,
  generationsFilterOptions,
  environmentFilterOptions,
}: {
  view: MetricsFilterFetcherProps["view"];
  traceFilterOptions: RouterOutputs["traces"]["filterOptions"] | undefined;
  generationsFilterOptions:
    | RouterOutputs["generations"]["filterOptions"]
    | undefined;
  environmentFilterOptions:
    | RouterOutputs["projects"]["environmentFilterOptions"]
    | undefined;
}): GetMetricsFilterColumnsParams => ({
  selectedView: view,
  viewVersion: "v1",
  environmentOptions:
    environmentFilterOptions?.map((value) => ({
      value: value.environment,
    })) ?? [],
  nameOptions: normalizeSingleValueOptions(traceFilterOptions?.name),
  observationNameOptions: normalizeSingleValueOptions(
    generationsFilterOptions?.name,
  ),
  tagsOptions: traceFilterOptions?.tags ?? [],
  modelOptions: generationsFilterOptions?.model ?? [],
  toolNamesOptions: generationsFilterOptions?.toolNames ?? [],
  calledToolNamesOptions: generationsFilterOptions?.calledToolNames ?? [],
  observationLevelOptions,
  experimentNameOptions: [],
  experimentDatasetOptions: [],
  observationTypeOptions,
  userOptions: [],
  sessionOptions: [],
  versionOptions: [],
  releaseOptions: [],
  traceReleaseOptions: [],
  traceVersionOptions: [],
  scoreNameOptions: [],
  experimentIdOptions: [],
  metadataKeyOptions: [],
});
