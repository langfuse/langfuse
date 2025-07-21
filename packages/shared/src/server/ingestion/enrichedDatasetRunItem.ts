import { DatasetRunItemDomain } from "../../domain/dataset-run-items";
import {
  validateDatasetItemAndFetch,
  validateDatasetRunAndFetch,
} from "../repositories";

type EnrichDatasetRunItemParams = {
  projectId: string;
  runItemId: string;
  body: any;
};

export async function enrichedDatasetRunItem(
  params: EnrichDatasetRunItemParams,
): Promise<DatasetRunItemDomain | null> {
  const { body, projectId, runItemId } = params;

  const [runData, itemData] = await Promise.all([
    validateDatasetRunAndFetch({
      datasetId: body.datasetId,
      runId: body.runId,
      projectId,
    }),
    validateDatasetItemAndFetch({
      datasetId: body.datasetId,
      itemId: body.datasetItemId,
      projectId,
    }),
  ]);

  if (!runData.success || !itemData.success) return null;

  const enrichedDatasetRunItem = {
    id: runItemId,
    projectId,
    runItemId,
    datasetId: body.datasetId,
    traceId: body.traceId,
    observationId: body.observationId ?? null,
    error: body.error,
    createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
    updatedAt: body.createdAt ? new Date(body.createdAt) : new Date(),
    datasetRunId: runData.datasetRun.id,
    datasetRunName: runData.datasetRun.name,
    datasetRunDescription: runData.datasetRun.description,
    datasetRunMetadata: runData.datasetRun.metadata,
    datasetRunCreatedAt: runData.datasetRun.createdAt,
    datasetItemId: itemData.datasetItem.id,
    datasetItemInput: itemData.datasetItem.input,
    datasetItemExpectedOutput: itemData.datasetItem.expectedOutput,
    datasetItemMetadata: itemData.datasetItem.metadata,
  };

  return enrichedDatasetRunItem as DatasetRunItemDomain;
}
