import { logger, traceException } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { createManyDatasetItems } from "@langfuse/shared/src/server";
import {
  applyFullMapping,
  BatchActionStatus,
  type ObservationAddToDatasetConfig,
  type MappingError,
} from "@langfuse/shared";

// Chunk size for batch processing. Smaller than the default 1000 because:
// 1. Each observation requires JSON path evaluation and mapping transformation
// 2. Dataset item validation with schema checking is CPU-intensive
// 3. Smaller chunks provide more frequent progress updates to the UI
const CHUNK_SIZE = 100;

type ObservationForMapping = {
  id: string;
  traceId: string;
  input: unknown;
  output: unknown;
  metadata: unknown;
};

function formatMappingErrors(
  observationId: string,
  errors: MappingError[],
): string {
  const details = errors.map((e) => e.message).join("; ");
  return `Observation ${observationId}: Mapping failed - ${details}`;
}

async function processChunk(params: {
  projectId: string;
  datasetId: string;
  mapping: ObservationAddToDatasetConfig["mapping"];
  observations: ObservationForMapping[];
}): Promise<{ processed: number; failed: number; errors: string[] }> {
  const { projectId, datasetId, mapping, observations } = params;

  const items: Array<{
    datasetId: string;
    input: unknown;
    expectedOutput: unknown;
    metadata: unknown;
    sourceTraceId: string;
    sourceObservationId: string;
  }> = [];
  let mappingFailedCount = 0;
  const mappingErrors: string[] = [];

  for (const obs of observations) {
    const mapped = applyFullMapping({
      observation: {
        input: obs.input,
        output: obs.output,
        metadata: obs.metadata,
      },
      mapping,
    });

    if (mapped.errors.length > 0) {
      mappingFailedCount++;
      mappingErrors.push(formatMappingErrors(obs.id, mapped.errors));
      continue;
    }

    items.push({
      datasetId,
      input: mapped.input,
      expectedOutput: mapped.expectedOutput ?? undefined,
      metadata: mapped.metadata ?? undefined,
      sourceTraceId: obs.traceId,
      sourceObservationId: obs.id,
    });
  }

  // If all observations failed mapping, return early
  if (items.length === 0) {
    return {
      processed: 0,
      failed: mappingFailedCount,
      errors: mappingErrors,
    };
  }

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
        failed: items.length + mappingFailedCount,
        errors: [
          ...mappingErrors,
          ...result.validationErrors.map(
            (e) =>
              `Item ${e.itemIndex}: ${e.field} - ${e.errors.map((err) => err.message).join(", ")}`,
          ),
        ],
      };
    }

    // Success (possibly partial)
    const validationErrors = result.validationErrors
      ? result.validationErrors.map(
          (e) =>
            `Item ${e.itemIndex}: ${e.field} - ${e.errors.map((err) => err.message).join(", ")}`,
        )
      : [];

    return {
      processed: result.successCount,
      failed: result.failedCount + mappingFailedCount,
      errors: [...mappingErrors, ...validationErrors],
    };
  } catch (error) {
    logger.error("Failed to create dataset items in chunk", error);
    traceException(error);
    return {
      processed: 0,
      failed: items.length + mappingFailedCount,
      errors: [
        ...mappingErrors,
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
      status: BatchActionStatus.Processing,
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
    failed === 0
      ? BatchActionStatus.Completed
      : processed === 0
        ? BatchActionStatus.Failed
        : BatchActionStatus.Partial;

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
