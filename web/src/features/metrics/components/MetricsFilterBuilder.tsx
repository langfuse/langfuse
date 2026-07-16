import { startCase } from "lodash";
import { AlertCircle } from "lucide-react";

import {
  type ColumnDefinition,
  type FilterState,
  ObservationLevelDomain,
  ObservationTypeDomain,
  type SingleValueOption,
  type TimeFilter,
} from "@langfuse/shared";
import { type views, type ViewVersion } from "@langfuse/shared/query";
import { type z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  mapViewFilterToUiTableFilter,
  partitionWidgetUiTableFiltersToView,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { useMetadataValueOptions } from "@/src/features/events/hooks/useMetadataValueOptions";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { normalizeSingleValueOptions } from "@/src/features/filters/lib/filter-transform";
import {
  getMetricsColumnsWithCustomSelect,
  getMetricsFilterColumns,
  type GetMetricsFilterColumnsParams,
} from "@/src/features/metrics/metricsFilterColumns";

const observationLevelOptions = ObservationLevelDomain.options.map((value) => ({
  value,
}));
const observationTypeOptions = ObservationTypeDomain.options.map((value) => ({
  value,
}));

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

/** MetricsFilterBuilder filters metrics by the dimensions of the data model, dispatching to the version-specific fetcher. */
export const MetricsFilterBuilder = ({
  version,
  ...props
}: MetricsFilterFetcherProps & { version: ViewVersion }) => {
  if (version === "v1") return <MetricsFilterBuilderV1 {...props} />;
  return <MetricsFilterBuilderV2 {...props} />;
};

/** MetricsFilterDateRange is the preview/lookback window used to scope filter-value discovery. */
type MetricsFilterDateRange = { from: Date; to?: Date };

/** MetricsFilterFetcherProps is the version-agnostic contract shared by both fetchers. */
type MetricsFilterFetcherProps = {
  view: z.infer<typeof views>;
  projectId: string;
  dateRange?: MetricsFilterDateRange;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
};

/** MetricsFilterBuilderV1 loads the v1 (traces + generations + project) filter options and renders the filter view. */
const MetricsFilterBuilderV1 = ({
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
    v1FilterOptionsQueryConfig,
  );

  const generationsFilterOptions = api.generations.filterOptions.useQuery(
    {
      projectId,
      startTimeFilter: metricsFilterTimeFilter("startTime", dateRange),
      observationType: "ALL",
    },
    v1FilterOptionsQueryConfig,
  );

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      { projectId, fromTimestamp: dateRange?.from },
      v1FilterOptionsQueryConfig,
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

/** MetricsFilterBuilderV2 loads the v2 (events) filter options and renders the filter view with metadata value suggestions. */
const MetricsFilterBuilderV2 = ({
  view,
  projectId,
  dateRange,
  filters,
  onChange,
}: MetricsFilterFetcherProps) => {
  const startTimeFilter = metricsFilterTimeFilter("startTime", dateRange);

  const eventsFilterOptions = api.events.filterOptions.useQuery(
    { projectId, startTimeFilter },
    v2FilterOptionsQueryConfig,
  );

  const metadataKeys = api.events.metadataKeys.useQuery(
    { projectId, startTimeFilter },
    v2FilterOptionsQueryConfig,
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

/** MetricsFilterView renders the metric filter builder, translating between view-dimension space and UI-table labels and surfacing rows that are not valid for the view. */
const MetricsFilterView = ({
  view,
  columns,
  columnsWithCustomSelect,
  stringObjectValueOptions,
  onStringObjectKeyChange,
  filters,
  onChange,
}: {
  view: z.infer<typeof views>;
  columns: ColumnDefinition[];
  columnsWithCustomSelect: string[];
  stringObjectValueOptions?: Record<string, SingleValueOption[]>;
  onStringObjectKeyChange?: (key: string) => void;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}) => {
  const editorFilters = viewFiltersToEditorFilters(view, filters);
  const unsupported = unsupportedViewFilters(view, filters);
  const unsupportedColumns = Array.from(
    new Set(unsupported.map((filter) => filter.column)),
  ).join(", ");

  return (
    <div className="space-y-2">
      {unsupported.length > 0 && (
        <Alert
          variant="default"
          className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20"
        >
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
          <AlertTitle className="text-yellow-800 dark:text-yellow-400">
            Unsupported legacy filters
          </AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-500">
            {`This still contains filter columns that are not supported for ${startCase(view)}: ${unsupportedColumns}. Remove them or switch to a compatible view before saving.`}
          </AlertDescription>
        </Alert>
      )}
      <InlineFilterBuilder
        columns={columns}
        filterState={editorFilters}
        onChange={(next: FilterState) =>
          onChange(editorFiltersToViewFilters(view, next))
        }
        columnsWithCustomSelect={columnsWithCustomSelect}
        stringObjectValueOptions={stringObjectValueOptions}
        onStringObjectKeyChange={onStringObjectKeyChange}
      />
    </div>
  );
};

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

/** viewFiltersToEditorFilters relabels canonical view-dimension rows into UI-table labels for the builder, preserving unmapped rows. */
const viewFiltersToEditorFilters = (
  view: z.infer<typeof views>,
  filters: FilterState,
): FilterState => {
  const { mappedFilters, unsupportedFilters } =
    partitionWidgetUiTableFiltersToView(view, filters);
  return [
    ...mapViewFilterToUiTableFilter(view, mappedFilters),
    ...unsupportedFilters,
  ];
};

/** editorFiltersToViewFilters canonicalizes edited UI-table rows back into view-dimension space, preserving unmapped rows. */
const editorFiltersToViewFilters = (
  view: z.infer<typeof views>,
  filters: FilterState,
): FilterState => {
  const { mappedFilters, unsupportedFilters } =
    partitionWidgetUiTableFiltersToView(view, filters);
  return [...mappedFilters, ...unsupportedFilters];
};

/** unsupportedViewFilters lists rows whose column is known but not valid for the view. */
const unsupportedViewFilters = (
  view: z.infer<typeof views>,
  filters: FilterState,
): FilterState =>
  partitionWidgetUiTableFiltersToView(view, filters).unsupportedFilters;

/** __test exposes private helpers to co-located tests without widening the module API. */
export const __test = {
  buildV2FilterColumnsParams,
  viewFiltersToEditorFilters,
  editorFiltersToViewFilters,
  unsupportedViewFilters,
};
