import type { ColumnDefinition, FilterState } from "@langfuse/shared";

export type DatasetFilterOption = {
  id: string;
  name: string;
};

const DATASET_ID_COLUMN = "experimentDatasetId";
export const DATASET_NAME_COLUMN = "experimentDatasetName";
export const DATASET_NAME_FILTER_COLUMN: ColumnDefinition = {
  name: "Experiment dataset name",
  id: DATASET_NAME_COLUMN,
  aliases: ["dataset", "datasetname", "dataset_name"],
  type: "stringOptions",
  internal: "experiment_dataset_id",
  options: [],
  nullable: true,
};

export function toDatasetNameFilters(
  filters: FilterState,
  datasets: DatasetFilterOption[],
): FilterState {
  const nameById = new Map(
    datasets.map((dataset) => [dataset.id, dataset.name]),
  );

  return filters.map((filter) => {
    if (
      filter.column !== DATASET_ID_COLUMN ||
      filter.type !== "stringOptions"
    ) {
      return filter;
    }

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
      return {
        ...filter,
        column: DATASET_ID_COLUMN,
        value: filter.value.map((name) => idByName.get(name) ?? name),
      };
    }

    return { ...filter, column: DATASET_ID_COLUMN };
  }) as FilterState;
}
