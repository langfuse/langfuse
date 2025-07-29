import { UiColumnMappings } from "./types";

export const datasetRunItemsTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Dataset Run Name",
    uiTableId: "datasetRunName",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: 'dri."dataset_run_name"',
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: 'dri."created_at"',
  },
];
