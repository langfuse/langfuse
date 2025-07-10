import { DatasetRunItemDomain } from "../../domain/dataset-run-items";
import { DatasetRunItemRecordReadType } from "./definitions";

export const convertToDatasetRunItem = (
  row: DatasetRunItemRecordReadType,
): DatasetRunItemDomain => {
  return {
    id: row.id,
    projectId: row.project_id,
    traceId: row.trace_id,
    observationId: row.observation_id ?? null,
    datasetRunId: row.dataset_run_id,
    datasetRunName: row.dataset_run_name,
    datasetRunDescription: row.dataset_run_description ?? null,
    datasetRunMetadata: row.dataset_run_metadata ?? null,
    datasetItemId: row.dataset_item_id,
    datasetItemInput: row.dataset_item_input,
    datasetItemExpectedOutput: row.dataset_item_expected_output,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
};

export const convertToDatasetRunMetrics = (row: any) => {
  return {
    id: row.dataset_run_id,
    projectId: row.project_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    name: row.datasetRunName,
    description: row.datasetRunDescription ?? "",
    metadata: row.datasetRunMetadata,
    countRunItems: row.count_run_items,
    avgTotalCost: undefined,
    avgLatency: undefined,
    scores: undefined,
    datasetId: row.dataset_id,
  };
};
