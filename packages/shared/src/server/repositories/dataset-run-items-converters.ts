import { DatasetRunItemDomain } from "../../domain/dataset-run-items";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";
import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { DatasetRunItemRecordReadType } from "./definitions";

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

export const convertDatasetRunItemDomainToClickhouse = (
  datasetRunItem: DatasetRunItemDomain,
): DatasetRunItemRecordReadType => {
  return {
    id: datasetRunItem.id,
    project_id: datasetRunItem.projectId,
    trace_id: datasetRunItem.traceId,
    observation_id: datasetRunItem.observationId,
    dataset_id: datasetRunItem.datasetId,
    dataset_run_id: datasetRunItem.datasetRunId,
    dataset_run_name: datasetRunItem.datasetRunName,
    dataset_run_description: datasetRunItem.datasetRunDescription,
    dataset_run_metadata: datasetRunItem.datasetRunMetadata as Record<
      string,
      string
    >,
    dataset_item_id: datasetRunItem.datasetItemId,
    dataset_item_input: datasetRunItem.datasetItemInput as string,
    dataset_item_expected_output:
      datasetRunItem.datasetItemExpectedOutput as string,
    dataset_item_metadata: datasetRunItem.datasetItemMetadata as Record<
      string,
      string
    >,
    created_at: convertDateToClickhouseDateTime(datasetRunItem.createdAt),
    updated_at: convertDateToClickhouseDateTime(datasetRunItem.updatedAt),
    event_ts: convertDateToClickhouseDateTime(new Date()),
    is_deleted: 0,
    dataset_run_created_at: convertDateToClickhouseDateTime(
      datasetRunItem.datasetRunCreatedAt,
    ),
    error: datasetRunItem.error,
  };
};

export const convertDatasetRunItemClickhouseToDomain = (
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
    datasetRunCreatedAt: parseClickhouseUTCDateTimeFormat(
      row.dataset_run_created_at,
    ),
    datasetRunMetadata:
      parseMetadataCHRecordToDomain(row.dataset_run_metadata) ?? null,
    datasetItemId: row.dataset_item_id,
    datasetItemInput: row.dataset_item_input,
    datasetItemExpectedOutput: row.dataset_item_expected_output,
    datasetItemMetadata: parseMetadataCHRecordToDomain(
      row.dataset_item_metadata,
    ),
    createdAt: parseClickhouseUTCDateTimeFormat(row.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(row.updated_at),
    datasetId: row.dataset_id,
    error: row.error ?? null,
  };
};
