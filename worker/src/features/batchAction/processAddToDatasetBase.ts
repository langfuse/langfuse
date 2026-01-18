import { logger, traceException } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { createManyDatasetItems } from "@langfuse/shared/src/server";
import {
  applyFullMapping,
  BatchActionStatus,
  type AddToDatasetMappingConfig,
} from "@langfuse/shared";

// Chunk size for batch processing. Smaller than the default 1000 because:
// 1. Each item requires JSON path evaluation and mapping transformation
// 2. Dataset item validation with schema checking is CPU-intensive
// 3. Smaller chunks provide more frequent progress updates to the UI
const CHUNK_SIZE = 100;

/**
 * Base type for items that can be added to a dataset.
 * Both traces and observations have input/output/metadata.
 */
export type SourceItemForMapping = {
  id: string;
  input: unknown;
  output: unknown;
  metadata: unknown;
};

/**
 * Function type for converting a source item to dataset item source references.
 * Observations have both sourceTraceId and sourceObservationId.
 * Traces only have sourceTraceId.
 */
export type SourceReferenceMapper<T extends SourceItemForMapping> = (
  item: T,
) => {
  sourceTraceId: string;
  sourceObservationId: string | undefined;
};

async function processChunk<T extends SourceItemForMapping>(params: {
  projectId: string;
  datasetId: string;
  mapping: AddToDatasetMappingConfig;
  items: T[];
  mapSourceReference: SourceReferenceMapper<T>;
}): Promise<{ processed: number; failed: number; errors: string[] }> {
  const { projectId, datasetId, mapping, items, mapSourceReference } = params;

  const datasetItems = items.map((item) => {
    const mapped = applyFullMapping({
      observation: {
        input: item.input,
        output: item.output,
        metadata: item.metadata,
      },
      mapping,
    });

    const sourceRef = mapSourceReference(item);

    return {
      datasetId,
      input: mapped.input,
      expectedOutput: mapped.expectedOutput ?? undefined,
      metadata: mapped.metadata ?? undefined,
      sourceTraceId: sourceRef.sourceTraceId,
      sourceObservationId: sourceRef.sourceObservationId,
    };
  });

  try {
    const result = await createManyDatasetItems({
      projectId,
      items: datasetItems,
      normalizeOpts: { sanitizeControlChars: true },
      validateOpts: { normalizeUndefinedToNull: true },
      allowPartialSuccess: true,
    });

    if (!result.success) {
      return {
        processed: 0,
        failed: datasetItems.length,
        errors: result.validationErrors.map(
          (e) =>
            `Item ${e.itemIndex}: ${e.field} - ${e.errors.map((err) => err.message).join(", ")}`,
        ),
      };
    }

    const errors = result.validationErrors
      ? result.validationErrors.map(
          (e) =>
            `Item ${e.itemIndex}: ${e.field} - ${e.errors.map((err) => err.message).join(", ")}`,
        )
      : [];

    return {
      processed: result.successCount,
      failed: result.failedCount,
      errors,
    };
  } catch (error) {
    logger.error("Failed to create dataset items in chunk", error);
    traceException(error);
    return {
      processed: 0,
      failed: datasetItems.length,
      errors: [
        `Failed to create chunk: ${error instanceof Error ? error.message : "Unknown error"}`,
      ],
    };
  }
}

/**
 * Generic processor for adding items (traces or observations) to a dataset.
 * Handles chunked processing, progress updates, and status management.
 */
export async function processAddToDataset<
  T extends SourceItemForMapping,
>(params: {
  projectId: string;
  batchActionId: string;
  datasetId: string;
  mapping: AddToDatasetMappingConfig;
  items: T[];
  mapSourceReference: SourceReferenceMapper<T>;
  actionName: string;
}): Promise<void> {
  const {
    projectId,
    batchActionId,
    datasetId,
    mapping,
    items,
    mapSourceReference,
    actionName,
  } = params;

  // Update status to PROCESSING
  await prisma.batchAction.update({
    where: { id: batchActionId },
    data: {
      status: BatchActionStatus.Processing,
      totalCount: items.length,
    },
  });

  let processed = 0;
  let failed = 0;
  const allErrors: string[] = [];

  // Process in chunks
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);

    const result = await processChunk({
      projectId,
      datasetId,
      mapping,
      items: chunk,
      mapSourceReference,
    });

    processed += result.processed;
    failed += result.failed;

    if (result.errors.length > 0) {
      // Limit error accumulation to prevent massive log strings
      allErrors.push(...result.errors.slice(0, 10));
    }

    // Update progress periodically (every 5 chunks or at the end)
    if (i % (CHUNK_SIZE * 5) === 0 || i + CHUNK_SIZE >= items.length) {
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

  logger.info(`Completed ${actionName} action ${batchActionId}`, {
    processed,
    failed,
    finalStatus,
  });
}
