import { UiColumnMappings } from "./types";

export const datasetRunItemsTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Dataset Run ID",
    uiTableId: "datasetRunId",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: 'dri."dataset_run_id"',
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: 'dri."created_at"',
  },
  {
    uiTableName: "Event Timestamp",
    uiTableId: "eventTs",
    clickhouseTableName: "dataset_run_items",
    clickhouseSelect: 'dri."event_ts"',
  },
];
