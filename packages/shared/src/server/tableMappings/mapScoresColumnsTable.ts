import { UiColumnMappings } from "../../tableDefinitions";

export const scoresColumnsTableUiColumnDefinitions: UiColumnMappings = [
  // scores native columns
  {
    uiTableName: "Timestamp",
    uiTableId: "timestamp",
    clickhouseTableName: "scores",
    clickhouseSelect: "timestamp",
  },
  {
    uiTableName: "Session ID",
    uiTableId: "sessionId",
    clickhouseTableName: "scores",
    clickhouseSelect: 's."session_id"',
  },
  {
    uiTableName: "Dataset Run IDs",
    uiTableId: "datasetRunIds",
    clickhouseTableName: "scores",
    clickhouseSelect: 's."dataset_run_id"',
  },
  {
    uiTableName: "Observation ID",
    uiTableId: "observationId",
    clickhouseTableName: "scores",
    clickhouseSelect: 's."observation_id"',
  },
  // require join of scores with dataset_run_items_rmt via trace_id and project_id
  {
    uiTableName: "Dataset Run Item Run IDs",
    uiTableId: "datasetRunItemRunIds",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: 'dri."dataset_run_id"',
  },
  {
    uiTableName: "Dataset Item IDs",
    uiTableId: "datasetItemIds",
    clickhouseTableName: "dataset_run_items_rmt",
    clickhouseSelect: 'dri."dataset_item_id"',
  },
];
