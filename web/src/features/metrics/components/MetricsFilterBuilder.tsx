import { startCase } from "lodash";
import { AlertCircle } from "lucide-react";
import {
  type ColumnDefinition,
  type FilterState,
  ObservationLevelDomain,
  ObservationTypeDomain,
  type SingleValueOption,
} from "@langfuse/shared";
import { type views } from "@langfuse/shared/query";
import { type z } from "zod";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { type RouterInputs, type RouterOutputs } from "@/src/utils/api";
import {
  displayNameForFilterColumn,
  mapViewFilterToUiTableFilter,
  partitionWidgetUiTableFiltersToView,
} from "@/src/features/dashboard";
import {
  InlineFilterBuilder,
  normalizeSingleValueOptions,
  sortOptionValues,
} from "@/src/features/filters";
import { type GetMetricsFilterColumnsParams } from "@/src/features/metrics/metricsFilterColumns";

const observationLevelOptions = ObservationLevelDomain.options.map((value) => ({
  value,
}));
const observationTypeOptions = ObservationTypeDomain.options.map((value) => ({
  value,
}));

/** Renders the filter controls without fetching. */
export function MetricsFilterBuilder({
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
}) {
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
}

/** buildV1FilterColumnsParams assembles the metric filter column options from the v1 endpoints; v1 keeps plain-string columns, so the events-only suggestion lists stay empty. */
export const buildV1FilterColumnsParams = ({
  view,
  traceFilterOptions,
  generationsFilterOptions,
  environmentFilterOptions,
  evaluatorOptions = [],
}: {
  view: z.infer<typeof views>;
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
export const buildV2FilterColumnsParams = ({
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
export type EventFilterOptionsColumn = NonNullable<
  RouterInputs["events"]["filterOptions"]["columns"]
>[number];

export const __test = {
  buildV2FilterColumnsParams,
  viewFiltersToEditorFilters,
  editorFiltersToViewFilters,
  resolvesToColumn,
};
