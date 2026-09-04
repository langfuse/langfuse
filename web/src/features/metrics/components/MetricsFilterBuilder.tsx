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

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { api, type RouterInputs, type RouterOutputs } from "@/src/utils/api";
import {
  displayNameForFilterColumn,
  mapViewFilterToUiTableFilter,
  partitionWidgetUiTableFiltersToView,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { useMetadataValueOptions } from "@/src/features/events/hooks/useMetadataValueOptions";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { normalizeSingleValueOptions } from "@/src/features/filters/lib/filter-transform";
import { sortOptionValues } from "@/src/features/filters/lib/option-sort";
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

/** MetricsFilterBuilder filters metrics by the dimensions of the data model, dispatching to the version-specific fetcher. */
export const MetricsFilterBuilder = ({
  version,
  ...props
}: MetricsFilterFetcherProps & { version: ViewVersion }) => {
  const evaluatorOptions = api.evalsV2.options.useQuery(
    { projectId: props.projectId, limit: 100 },
    v2FilterOptionsQueryConfig,
  );
  const evaluatorNameOptions =
    evaluatorOptions.data?.map(({ id, name }) => ({
      value: id,
      displayValue: name,
    })) ?? [];

  if (version === "v1") {
    return (
      <MetricsFilterBuilderV1
        {...props}
        evaluatorOptions={evaluatorNameOptions}
      />
    );
  }
  return (
    <MetricsFilterBuilderV2
      {...props}
      evaluatorOptions={evaluatorNameOptions}
    />
  );
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

type MetricsFilterFetcherWithEvaluatorOptionsProps =
  MetricsFilterFetcherProps & {
    evaluatorOptions: SingleValueOption[];
  };

/** MetricsFilterBuilderV1 loads the v1 (traces + generations + project) filter options and renders the filter view. */
const MetricsFilterBuilderV1 = ({
  view,
  projectId,
  dateRange,
  filters,
  onChange,
  evaluatorOptions,
}: MetricsFilterFetcherWithEvaluatorOptionsProps) => {
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
    evaluatorOptions,
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
  evaluatorOptions,
}: MetricsFilterFetcherWithEvaluatorOptionsProps) => {
  const startTimeFilter = metricsFilterTimeFilter("startTime", dateRange);

  const eventsFilterOptions = api.events.filterOptions.useQuery(
    { projectId, startTimeFilter, columns: eventsFilterOptionsColumns },
    v2FilterOptionsQueryConfig,
  );

  const slowEventsFilterOptions = api.events.filterOptions.useQuery(
    { projectId, startTimeFilter, columns: slowEventsFilterOptionsColumns },
    v2FilterOptionsQueryConfig,
  );

  const datasets = api.datasets.allDatasetMeta.useQuery({ projectId });

  const { metadataValueOptions, onMetadataKeyChange } = useMetadataValueOptions(
    { projectId, filterState: filters, startTimeFilter },
  );

  const params = buildV2FilterColumnsParams({
    view,
    filterOptions: eventsFilterOptions.data,
    slowFilterOptions: slowEventsFilterOptions.data,
    datasets: datasets.data,
    evaluatorOptions,
    metadataKeys: eventsFilterOptions.data?.metadataKeys?.map(
      (row) => row.value,
    ),
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
  const renderable = editorFilters.filter((filter) =>
    resolvesToColumn(filter, columns),
  );
  const unsupportedColumns = Array.from(
    new Set(
      editorFilters
        .filter((filter) => !resolvesToColumn(filter, columns))
        .map((filter) => displayNameForFilterColumn(filter.column)),
    ),
  ).join(", ");

  return (
    <div className="space-y-2">
      {unsupportedColumns.length > 0 && (
        <Alert variant="warning" icon={AlertCircle}>
          <Alert.Title>Unsupported filters</Alert.Title>
          <Alert.Description>
            {`These filter columns are not supported for ${startCase(view)} and were dropped: ${unsupportedColumns}. Switch back to a compatible view to restore them.`}
          </Alert.Description>
        </Alert>
      )}
      <InlineFilterBuilder
        columns={columns}
        filterState={renderable}
        onChange={(next: FilterState) =>
          onChange(editorFiltersToViewFilters(view, next))
        }
        columnsWithCustomSelect={columnsWithCustomSelect}
        stringObjectValueOptions={stringObjectValueOptions}
        onStringObjectKeyChange={onStringObjectKeyChange}
        compact
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
  evaluatorOptions = [],
}: {
  view: MetricsFilterFetcherProps["view"];
  traceFilterOptions: RouterOutputs["traces"]["filterOptions"] | undefined;
  generationsFilterOptions:
    | RouterOutputs["generations"]["filterOptions"]
    | undefined;
  environmentFilterOptions:
    | RouterOutputs["projects"]["environmentFilterOptions"]
    | undefined;
  evaluatorOptions?: SingleValueOption[];
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
  scoreNameOptions: [],
  experimentIdOptions: [],
  evaluatorOptions,
  metadataKeyOptions: [],
});

/** buildV2FilterColumnsParams assembles the metric filter column options from the v2 events filter-options discovery; closed Type/Level enums come from the domain schemas. */
const buildV2FilterColumnsParams = ({
  view,
  filterOptions,
  slowFilterOptions,
  datasets,
  evaluatorOptions = [],
  metadataKeys,
}: {
  view: z.infer<typeof views>;
  filterOptions: RouterOutputs["events"]["filterOptions"] | undefined;
  slowFilterOptions?: RouterOutputs["events"]["filterOptions"];
  datasets: Array<{ id: string; name: string }> | undefined;
  evaluatorOptions?: SingleValueOption[];
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
    tagsOptions: sortOptionValues(filterOptions?.traceTags ?? []),
    modelOptions: filterOptions?.providedModelName ?? [],
    toolNamesOptions: slowFilterOptions?.toolNames ?? [],
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
    releaseOptions: normalizeSingleValueOptions(filterOptions?.release),
    scoreNameOptions: scoreNameOptionsForView(view, filterOptions),
    experimentIdOptions: normalizeSingleValueOptions(
      filterOptions?.experimentId,
    ),
    evaluatorOptions,
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

/** resolvesToColumn reports whether the builder has a column definition able to render the row. */
const resolvesToColumn = (
  filter: FilterState[number],
  columns: ColumnDefinition[],
): boolean =>
  columns.some(
    (column) =>
      column.id === filter.column ||
      column.name === filter.column ||
      column.aliases?.includes(filter.column) === true,
  );

/** EventFilterOptionsColumn is one facet column the events filter-options endpoint understands. */
type EventFilterOptionsColumn = NonNullable<
  RouterInputs["events"]["filterOptions"]["columns"]
>[number];

export const __test = {
  buildV2FilterColumnsParams,
  viewFiltersToEditorFilters,
  editorFiltersToViewFilters,
  resolvesToColumn,
};
