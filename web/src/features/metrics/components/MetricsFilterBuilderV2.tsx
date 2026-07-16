import {
  ObservationLevelDomain,
  ObservationTypeDomain,
  type SingleValueOption,
} from "@langfuse/shared";
import { type views } from "@langfuse/shared/query";
import { type z } from "zod";

import { api, type RouterOutputs } from "@/src/utils/api";
import { normalizeSingleValueOptions } from "@/src/features/filters/lib/filter-transform";
import { useMetadataValueOptions } from "@/src/features/events/hooks/useMetadataValueOptions";
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
  staleTime: 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

/** MetricsFilterBuilderV2 loads the v2 (events) filter options and renders the filter view with metadata value suggestions. */
export const MetricsFilterBuilderV2 = ({
  view,
  projectId,
  dateRange,
  filters,
  onChange,
}: MetricsFilterFetcherProps) => {
  const startTimeFilter = metricsFilterTimeFilter("startTime", dateRange);

  const eventsFilterOptions = api.events.filterOptions.useQuery(
    { projectId, startTimeFilter },
    filterOptionsQueryConfig,
  );

  const metadataKeys = api.events.metadataKeys.useQuery(
    { projectId, startTimeFilter },
    filterOptionsQueryConfig,
  );

  const datasets = api.datasets.allDatasetMeta.useQuery({ projectId });

  const { metadataValueOptions, onMetadataKeyChange } = useMetadataValueOptions(
    { projectId, filterState: filters, startTimeFilter },
  );

  const params = buildV2FilterColumnsParams({
    view,
    filterOptions: eventsFilterOptions.data,
    datasets: datasets.data,
    metadataKeys: metadataKeys.data?.map((row) => row.value),
  });

  return (
    <MetricsFilterView
      view={view}
      columns={getMetricsFilterColumns(params)}
      columnsWithCustomSelect={getMetricsColumnsWithCustomSelect(params)}
      stringObjectValueOptions={metadataValueOptions}
      onStringObjectKeyChange={onMetadataKeyChange}
      filters={filters}
      onChange={onChange}
    />
  );
};

/** buildV2FilterColumnsParams assembles the metric filter column options from the v2 events filter-options discovery; closed Type/Level enums come from the domain schemas. */
const buildV2FilterColumnsParams = ({
  view,
  filterOptions,
  datasets,
  metadataKeys,
}: {
  view: z.infer<typeof views>;
  filterOptions: RouterOutputs["events"]["filterOptions"] | undefined;
  datasets: Array<{ id: string; name: string }> | undefined;
  metadataKeys?: string[];
}): GetMetricsFilterColumnsParams => {
  const datasetIds = new Set(
    (filterOptions?.experimentDatasetId ?? []).map((e) => e.value),
  );
  return {
    selectedView: view,
    viewVersion: "v2",
    environmentOptions: filterOptions?.environment ?? [],
    nameOptions: normalizeSingleValueOptions(filterOptions?.traceName),
    observationNameOptions: normalizeSingleValueOptions(filterOptions?.name),
    tagsOptions: filterOptions?.traceTags ?? [],
    modelOptions: filterOptions?.providedModelName ?? [],
    toolNamesOptions: filterOptions?.toolNames ?? [],
    calledToolNamesOptions: filterOptions?.calledToolNames ?? [],
    observationLevelOptions,
    experimentNameOptions: filterOptions?.experimentName ?? [],
    experimentDatasetOptions:
      datasets
        ?.filter((d) => datasetIds.has(d.id))
        .map((d) => ({ value: d.id, displayValue: d.name })) ?? [],
    observationTypeOptions,
    userOptions: normalizeSingleValueOptions(filterOptions?.userId),
    sessionOptions: normalizeSingleValueOptions(filterOptions?.sessionId),
    versionOptions: normalizeSingleValueOptions(filterOptions?.version),
    // Events denormalize trace release into e.release and conflate observation
    // and trace version into e.version, so each pair shares one source.
    releaseOptions: normalizeSingleValueOptions(filterOptions?.release),
    traceReleaseOptions: normalizeSingleValueOptions(filterOptions?.release),
    traceVersionOptions: normalizeSingleValueOptions(filterOptions?.version),
    scoreNameOptions: scoreNameOptionsForView(view, filterOptions),
    experimentIdOptions: normalizeSingleValueOptions(
      filterOptions?.experimentId,
    ),
    metadataKeyOptions: metadataKeys ?? [],
  };
};

/** scoreNameOptionsForView sources Score Name suggestions from the view's score facet. */
const scoreNameOptionsForView = (
  view: z.infer<typeof views>,
  filterOptions: RouterOutputs["events"]["filterOptions"] | undefined,
): SingleValueOption[] => {
  if (view === "scores-numeric") {
    return (filterOptions?.scores_avg ?? []).map((value) => ({ value }));
  }
  if (view === "scores-categorical") {
    return (filterOptions?.score_categories ?? []).map((category) => ({
      value: category.label,
    }));
  }
  return [];
};

export const __test = { buildV2FilterColumnsParams };
