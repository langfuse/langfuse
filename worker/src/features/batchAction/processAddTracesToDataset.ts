import type { TraceAddToDatasetConfig } from "@langfuse/shared";
import {
  processAddToDataset,
  type SourceItemForMapping,
} from "./processAddToDatasetBase";

/**
 * Trace-specific item type for dataset mapping.
 * Traces use their own ID as the sourceTraceId.
 */
type TraceForMapping = SourceItemForMapping;

/**
 * Process traces and add them to a dataset.
 * Delegates to the shared processAddToDataset with trace-specific mapping.
 */
export async function processAddTracesToDataset(params: {
  projectId: string;
  batchActionId: string;
  config: TraceAddToDatasetConfig;
  traces: TraceForMapping[];
}): Promise<void> {
  const { projectId, batchActionId, config, traces } = params;

  return processAddToDataset({
    projectId,
    batchActionId,
    datasetId: config.datasetId,
    mapping: config.mapping,
    items: traces,
    // Traces use their own ID as sourceTraceId, no sourceObservationId
    mapSourceReference: (trace) => ({
      sourceTraceId: trace.id,
      sourceObservationId: undefined,
    }),
    actionName: "trace-add-to-dataset",
  });
}
