import { UiColumnMappings } from "./types";

export const datasetItemsTableUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "ID",
    uiTableId: "id",
    clickhouseTableName: "dataset_items",
    clickhouseSelect: "id",
  },
  {
    uiTableName: "Dataset Name",
    uiTableId: "datasetName",
    clickhouseTableName: "datasets",
    clickhouseSelect: "name",
  },
  {
    uiTableName: "Status",
    uiTableId: "status",
    clickhouseTableName: "dataset_items",
    clickhouseSelect: "status",
  },
  {
    uiTableName: "Source Trace ID",
    uiTableId: "sourceTraceId",
    clickhouseTableName: "dataset_items",
    clickhouseSelect: "source_trace_id",
  },
  {
    uiTableName: "Source Observation ID",
    uiTableId: "sourceObservationId",
    clickhouseTableName: "dataset_items",
    clickhouseSelect: "source_observation_id",
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "dataset_items",
    clickhouseSelect: "created_at",
  },
  {
    uiTableName: "Updated At",
    uiTableId: "updatedAt",
    clickhouseTableName: "dataset_items",
    clickhouseSelect: "updated_at",
  },
];

export const datasetItemsFormFilterCols: UiColumnMappings = [
  {
    uiTableName: "Dataset Name",
    uiTableId: "datasetName",
    clickhouseTableName: "datasets",
    clickhouseSelect: "name",
  },
  {
    uiTableName: "Status",
    uiTableId: "status",
    clickhouseTableName: "dataset_items",
    clickhouseSelect: "status",
  },
  {
    uiTableName: "Source Trace ID",
    uiTableId: "sourceTraceId",
    clickhouseTableName: "dataset_items",
    clickhouseSelect: "source_trace_id",
  },
  {
    uiTableName: "Created At",
    uiTableId: "createdAt",
    clickhouseTableName: "dataset_items",
    clickhouseSelect: "created_at",
  },
];
