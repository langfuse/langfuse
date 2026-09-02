import { useMemo } from "react";
import {
  eventsEvalFilterColumns,
  experimentEvalFilterColsWithOptions,
  observationEvalFilterColsWithOptions,
  type ColumnDefinition,
} from "@langfuse/shared";

import type { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
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

export type MapSampleObservedOptions = (
  observed: ObservedOptions | undefined,
) => ObservedOptions | undefined;

type SampleObservationFilterOptionsProps = {
  datasetOptions: DatasetFilterOption[];
  filterOptions: Partial<
    ReturnType<typeof useEventsFilterOptions>["filterOptions"]
  >;
  isFilterOptionsPending: boolean;
  mapObservedOptions: MapSampleObservedOptions;
  activeRegistry: FieldRegistry;
};

export function useSampleObservationFilterOptions({
  datasetOptions,
  filterOptions,
  isFilterOptionsPending,
  mapObservedOptions,
  activeRegistry,
}: SampleObservationFilterOptionsProps) {
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
        observationEvalFilterColsWithOptions(filterOptions, [
          ...eventsEvalFilterColumns,
        ]),
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

  return { searchRegistry, observed, builderColumns, queryOnlyColumnIds };
}
