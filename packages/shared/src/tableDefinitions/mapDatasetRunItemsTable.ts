// This structure is maintained to relate the frontend table definitions with the clickhouse table definitions.
// The frontend only sends the column names to the backend. This needs to be changed in the future to send column IDs.

import { UiColumnMappings } from "./types";

export const datasetRunItemsTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Dataset Run ID",
    uiTableId: "datasetRunId",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: 'dri."dataset_run_id"',
  },
  {
    uiTableName: "Dataset Run Name",
    uiTableId: "datasetRunName",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: 'dri."dataset_run_name"',
  },
  {
    uiTableName: "Dataset Item ID",
    uiTableId: "datasetItemId",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: 'dri."dataset_item_id"',
  },
  {
    uiTableName: "Dataset ID",
    uiTableId: "datasetId",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: 'dri."dataset_id"',
  },
];
