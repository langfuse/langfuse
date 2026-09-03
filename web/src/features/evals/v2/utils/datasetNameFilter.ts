import type { ColumnDefinition } from "@langfuse/shared";

import type { ObservedOptions } from "@/src/features/search-bar/lib/observed-options";

export type DatasetFilterOption = {
  id: string;
  name: string;
};

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
