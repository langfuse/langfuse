import { logger, traceException } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { createManyDatasetItems } from "@langfuse/shared/src/server";
import {
  applyFieldMapping,
  type ObservationAddToDatasetConfig,
} from "@langfuse/shared";

const CHUNK_SIZE = 100; // Smaller chunks for complex processing with mapping

type ObservationForMapping = {
  id: string;
  trace_id: string | null;
  input: unknown;
  output: unknown;
  metadata: unknown;
};

async function processChunk(params: {
  projectId: string;
  datasetId: string;
  mapping: ObservationAddToDatasetConfig["mapping"];
  observations: ObservationForMapping[];
}): Promise<{ processed: number; failed: number; errors: string[] }> {
  const { projectId, datasetId, mapping, observations } = params;

  const items = observations.map((obs) => ({
    datasetId,
    input: applyFieldMapping({
      observation: obs,
      mappings: mapping.inputMappings,
    }),
    expectedOutput: mapping.expectedOutputMappings
      ? applyFieldMapping({
          observation: obs,
          mappings: mapping.expectedOutputMappings,
        })
      : undefined,
    metadata: mapping.metadataMappings
      ? applyFieldMapping({
          observation: obs,
          mappings: mapping.metadataMappings,
        })
      : undefined,
    sourceTraceId: obs.trace_id ?? undefined,
    sourceObservationId: obs.id,
  }));

  try {
    const result = await createManyDatasetItems({
      projectId,
      items,
      normalizeOpts: { sanitizeControlChars: true },
      validateOpts: { normalizeUndefinedToNull: true },
      allowPartialSuccess: true, // Allow partial success for bulk operations
    });

    if (!result.success) {
      // All items failed
      return {
        processed: 0,
        failed: items.length,
        errors: result.validationErrors.map(
          (e) =>
            `Item ${e.itemIndex}: ${e.field} - ${e.errors.map((err) => err.message).join(", ")}`,
        ),
      };
    }

    // Success (possibly partial)
    const failedCount = result.validationErrors?.length ?? 0;
    const errors = result.validationErrors
      ? result.validationErrors.map(
          (e) =>
            `Item ${e.itemIndex}: ${e.field} - ${e.errors.map((err) => err.message).join(", ")}`,
        )
      : [];

    return {
      processed: result.datasetItems.length,
      failed: failedCount,
      errors,
    };
  } catch (error) {
    logger.error("Failed to create dataset items in chunk", error);
    traceException(error);
    return {
      processed: 0,
      failed: items.length,
      errors: [
        `Failed to create chunk: ${error instanceof Error ? error.message : "Unknown error"}`,
      ],
    };
  }
}

export async function processAddObservationsToDataset(params: {
  projectId: string;
  batchActionId: string;
  config: ObservationAddToDatasetConfig;
  observations: ObservationForMapping[];
}): Promise<void> {
  const { projectId, batchActionId, config, observations } = params;
  const { datasetId, mapping } = config;

  // Update status to PROCESSING
  await prisma.batchAction.update({
    where: { id: batchActionId },
    data: {
      status: "PROCESSING",
      totalCount: observations.length,
    },
  });

  let processed = 0;
  let failed = 0;
  const allErrors: string[] = [];

  // Process in chunks
  for (let i = 0; i < observations.length; i += CHUNK_SIZE) {
    const chunk = observations.slice(i, i + CHUNK_SIZE);

    const result = await processChunk({
      projectId,
      datasetId,
      mapping,
      observations: chunk,
    });

    processed += result.processed;
    failed += result.failed;

    if (result.errors.length > 0) {
      // Limit error accumulation to prevent massive log strings
      allErrors.push(...result.errors.slice(0, 10));
    }

    // Update progress periodically (every 5 chunks or at the end)
    if (i % (CHUNK_SIZE * 5) === 0 || i + CHUNK_SIZE >= observations.length) {
      await prisma.batchAction.update({
        where: { id: batchActionId },
        data: { processedCount: processed, failedCount: failed },
      });
    }
  }

  // Determine final status
  const finalStatus =
    failed === 0 ? "COMPLETED" : processed === 0 ? "FAILED" : "PARTIAL";

  // Aggregate error summary
  const errorSummary =
    allErrors.length > 0
      ? `${failed} items failed validation. Sample errors:\n${allErrors.slice(0, 20).join("\n")}`
      : null;

  // Update final status
  await prisma.batchAction.update({
    where: { id: batchActionId },
    data: {
      status: finalStatus,
      finishedAt: new Date(),
      processedCount: processed,
      failedCount: failed,
      log: errorSummary,
    },
  });

  logger.info(`Completed observation-add-to-dataset action ${batchActionId}`, {
    processed,
    failed,
    finalStatus,
  });
}
