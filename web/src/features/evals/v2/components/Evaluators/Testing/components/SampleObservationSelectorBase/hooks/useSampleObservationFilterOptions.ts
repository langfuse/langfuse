import { useMemo } from "react";
import {
  eventsEvalFilterColumns,
  experimentEvalFilterColsWithOptions,
  observationEvalFilterColsWithOptions,
  type ColumnDefinition,
  type FilterState,
  type TimeFilter,
} from "@langfuse/shared";

import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import {
  type FieldRegistry,
  withFieldOptions,
} from "@/src/features/search-bar/lib/fields";
import {
  toObservedOptions,
  type ObservedOptions,
} from "@/src/features/search-bar/lib/observed-options";
import {
  removeInternalEvaluationEnvironmentColumnOptions,
  removeInternalEvaluationEnvironmentOptions,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/fns/buildSampleQueryFilters";
import {
  DATASET_NAME_COLUMN,
  DATASET_NAME_FILTER_COLUMN,
  addDatasetNameObservedOptions,
  type DatasetFilterOption,
} from "@/src/features/evals/v2/utils/datasetNameFilter";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";

export type MapSampleObservedOptions = (
  observed: ObservedOptions | undefined,
) => ObservedOptions | undefined;

const BUILDER_FILTER_OPTION_COLUMNS = [
  "environment",
  "name",
  "traceTags",
  "traceName",
  "calledToolNames",
  "experimentDatasetId",
] satisfies NonNullable<
  Parameters<typeof useEventsFilterOptions>[0]["columns"]
>;

type SampleObservationFilterOptionsProps = {
  projectId: string;
  startTimeFilter: TimeFilter[];
  refiningFilter: FilterState;
  filterMode: EvaluatorFilterExperience;
  datasetOptions: DatasetFilterOption[];
  mapObservedOptions: MapSampleObservedOptions;
  activeRegistry: FieldRegistry;
};

export function useSampleObservationFilterOptions({
  projectId,
  startTimeFilter,
  refiningFilter,
  filterMode,
  datasetOptions,
  mapObservedOptions,
  activeRegistry,
}: SampleObservationFilterOptionsProps) {
  const options = useEventsFilterOptions({
    projectId,
    startTimeFilter,
    refiningFilter,
    includeApproxCount: true,
    lazy: filterMode === "query",
    columns:
      filterMode === "builder" ? BUILDER_FILTER_OPTION_COLUMNS : undefined,
  });
  const { filterOptions, isFilterOptionsPending } = options;
  const searchRegistry = useMemo(
    () =>
      withFieldOptions(
        activeRegistry,
        DATASET_NAME_COLUMN,
        datasetOptions.map((dataset) => ({
          value: dataset.id,
          displayValue: dataset.name,
        })),
      ),
    [activeRegistry, datasetOptions],
  );

  const observed = useMemo(() => {
    const visibleOptions = removeInternalEvaluationEnvironmentOptions(
      toObservedOptions(filterOptions, isFilterOptionsPending),
    );
    const mapped = mapObservedOptions(visibleOptions);
    return addDatasetNameObservedOptions(mapped, datasetOptions);
  }, [
    datasetOptions,
    filterOptions,
    isFilterOptionsPending,
    mapObservedOptions,
  ]);

  const builderColumns = useMemo<ColumnDefinition[]>(() => {
    const supportsDatasetName = searchRegistry.fields.some(
      (field) => field.id === DATASET_NAME_COLUMN,
    );
    const columnsWithOptions = removeInternalEvaluationEnvironmentColumnOptions(
      experimentEvalFilterColsWithOptions(
        filterOptions,
        observationEvalFilterColsWithOptions(
          { ...filterOptions, tags: filterOptions.traceTags },
          [...eventsEvalFilterColumns],
        ),
      ),
    ).filter(
      (column) => !supportsDatasetName || column.id !== "experimentDatasetId",
    );
    const datasetColumn: ColumnDefinition = {
      name: DATASET_NAME_FILTER_COLUMN.name,
      id: "experimentDatasetId",
      aliases: DATASET_NAME_FILTER_COLUMN.aliases,
      type: "stringOptions",
      internal: DATASET_NAME_FILTER_COLUMN.internal,
      nullable: DATASET_NAME_FILTER_COLUMN.nullable,
      options: datasetOptions.map((dataset) => ({
        value: dataset.id,
        displayValue: dataset.name,
      })),
    };

    return supportsDatasetName
      ? [...columnsWithOptions, datasetColumn]
      : columnsWithOptions;
  }, [datasetOptions, filterOptions, searchRegistry]);

  const queryOnlyColumnIds = useMemo(
    () =>
      searchRegistry.fields
        .filter((field) => field.directFilter === false)
        .map((field) => field.filterColumn ?? field.id),
    [searchRegistry],
  );

  return {
    ...options,
    searchRegistry,
    observed,
    builderColumns,
    queryOnlyColumnIds,
  };
}
