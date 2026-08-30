import type { ColumnDefinition, FilterState } from "@langfuse/shared";

import type { ObservedOptions } from "@/src/features/search-bar/lib/observed-options";

export type DatasetFilterOption = {
  id: string;
  name: string;
};

const DATASET_ID_COLUMN = "experimentDatasetId";
export const DATASET_NAME_COLUMN = "datasetName";
export const DATASET_NAME_FILTER_COLUMN: ColumnDefinition = {
  name: "Dataset name",
  id: DATASET_NAME_COLUMN,
  aliases: [
    "dataset",
    "datasetname",
    "dataset_name",
    "experimentdatasetname",
    "experiment_dataset_name",
  ],
  type: "stringOptions",
  internal: "experiment_dataset_id",
  options: [],
  nullable: true,
};

export function addDatasetNameObservedOptions(
  observed: ObservedOptions | undefined,
  datasets: DatasetFilterOption[],
): ObservedOptions | undefined {
  if (observed === undefined) return undefined;
  return {
    ...observed,
    [DATASET_NAME_COLUMN]: datasets.map((dataset) => ({
      value: dataset.name,
    })),
  };
}

export function toDatasetNameFilters(
  filters: FilterState,
  datasets: DatasetFilterOption[],
): FilterState {
  const nameById = new Map(
    datasets.map((dataset) => [dataset.id, dataset.name]),
  );

  return filters.map((filter) => {
    if (filter.column !== DATASET_ID_COLUMN) return filter;
    if (filter.type === "null") {
      return { ...filter, column: DATASET_NAME_COLUMN };
    }
    if (filter.type !== "stringOptions") return filter;

    const names = filter.value.map((id) => nameById.get(id));
    if (names.some((name) => name === undefined)) return filter;

    return {
      ...filter,
      column: DATASET_NAME_COLUMN,
      value: names as string[],
    };
  }) as FilterState;
}

export function fromDatasetNameFilters(
  filters: FilterState,
  datasets: DatasetFilterOption[],
): FilterState {
  const idByName = new Map(
    datasets.map((dataset) => [dataset.name, dataset.id]),
  );

  return filters.map((filter) => {
    if (filter.column !== DATASET_NAME_COLUMN) return filter;

    if (filter.type === "stringOptions") {
      const ids = filter.value.map((name) => idByName.get(name));
      if (ids.some((id) => id === undefined)) return filter;

      return {
        ...filter,
        column: DATASET_ID_COLUMN,
        value: ids as string[],
      };
    }

    return { ...filter, column: DATASET_ID_COLUMN };
  }) as FilterState;
}
