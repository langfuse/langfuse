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
      runName: body.runName,
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
    ...body,
    projectId,
    runItemId,
    datasetId: body.datasetId,
    traceId: body.traceId,
    observationId: body.observationId,
    error: body.error,
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
    datasetRunId: runData.datasetRun.id,
    datasetRunName: runData.datasetRun.name,
    datasetRunDescription: runData.datasetRun.description,
    datasetRunMetadata: runData.datasetRun.metadata, // TODO: convert to domain
    datasetItemId: itemData.datasetItem.id,
    datasetItemInput: itemData.datasetItem.input,
    datasetItemExpectedOutput: itemData.datasetItem.expectedOutput, // TODO: convert to domain
    datasetItemMetadata: itemData.datasetItem.metadata,
  };

  return enrichedDatasetRunItem;
}
