import { UiColumnMappings } from "../../tableDefinitions";
import { DatasetRunItemDomain } from "../../domain/dataset-run-items";

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
  {
    uiTableName: "Scores (numeric)",
    uiTableId: "agg_scores_avg",
    clickhouseTableName: "scores",
    clickhouseSelect: "sa.scores_avg",
  },
  {
    uiTableName: "Scores (categorical)",
    uiTableId: "agg_score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: "sa.score_categories",
  },
];

export const mapDatasetRunItemFilterColumn = (
  dataset: Pick<DatasetRunItemDomain, "id" | "datasetId">,
  column: string,
): unknown => {
  const columnDef = datasetRunItemsTableUiColumnDefinitions.find(
    (col) =>
      col.uiTableId === column ||
      col.uiTableName === column ||
      col.clickhouseSelect === column,
  );
  if (!columnDef) {
    throw new Error(`Unhandled column for dataset run items filter: ${column}`);
  }
  switch (columnDef.uiTableId) {
    case "id":
      return dataset.id;
    case "datasetId":
      return dataset.datasetId;
    default:
      throw new Error(
        `Unhandled column in dataset run items filter mapping: ${column}`,
      );
  }
};
