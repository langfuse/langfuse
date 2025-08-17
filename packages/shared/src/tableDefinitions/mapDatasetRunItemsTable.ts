import { UiColumnMappings } from "./types";

export const datasetRunItemsTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Dataset Run ID",
    uiTableId: "datasetRunId",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: 'dri."dataset_run_id"',
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: 'dri."created_at"',
  },
  {
    uiTableName: "Event Timestamp",
    uiTableId: "eventTs",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: 'dri."event_ts"',
  },
  {
    uiTableName: "Dataset Item ID",
    uiTableId: "datasetItemId",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: 'dri."dataset_item_id"',
  },
  {
    uiTableName: "Dataset",
    uiTableId: "datasetId",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: 'dri."dataset_id"',
  },
];
