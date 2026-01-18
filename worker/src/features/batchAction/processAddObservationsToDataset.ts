import type { ObservationAddToDatasetConfig } from "@langfuse/shared";
import {
  processAddToDataset,
  type SourceItemForMapping,
} from "./processAddToDatasetBase";

/**
 * Observation-specific item type for dataset mapping.
 * Observations have an additional traceId field for the source reference.
 */
type ObservationForMapping = SourceItemForMapping & {
  traceId: string;
};

/**
 * Process observations and add them to a dataset.
 * Delegates to the shared processAddToDataset with observation-specific mapping.
 */
export async function processAddObservationsToDataset(params: {
  projectId: string;
  batchActionId: string;
  config: ObservationAddToDatasetConfig;
  observations: ObservationForMapping[];
}): Promise<void> {
  const { projectId, batchActionId, config, observations } = params;

  return processAddToDataset({
    projectId,
    batchActionId,
    datasetId: config.datasetId,
    mapping: config.mapping,
    items: observations,
    // Observations use traceId as sourceTraceId and their own id as sourceObservationId
    mapSourceReference: (obs) => ({
      sourceTraceId: obs.traceId,
      sourceObservationId: obs.id,
    }),
    actionName: "observation-add-to-dataset",
  });
}
