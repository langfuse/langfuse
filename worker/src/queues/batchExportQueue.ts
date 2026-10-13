import { Job, UnrecoverableError } from "bullmq";

import {
  BaseError,
  BatchExportStatus,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import {
  ClickHouseResourceError,
  traceException,
  logger,
} from "@langfuse/shared/src/server";
import { QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import { handleBatchExportJob } from "../features/batchExport/handleBatchExportJob";

// Read-stream failures reach the processor as the cause of the handler's own
// error, so the resource error can sit anywhere in the cause chain.
const hasClickHouseResourceErrorCause = (error: unknown): boolean => {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    if (ClickHouseResourceError.is(current)) return true;
    seen.add(current);
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

const getDisplayError = (e: unknown, isResourceError: boolean): string => {
  if (isResourceError) return ClickHouseResourceError.ERROR_ADVICE_MESSAGE;
  return e instanceof BaseError ? e.message : "An internal error occurred";
};

export const batchExportQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.BatchExport]>,
) => {
  try {
    logger.info("[BATCH EXPORT] Executing Batch Export Job", job.data.payload);
    await handleBatchExportJob(job.data.payload);

    logger.info("[BATCH EXPORT] Finished Batch Export Job", job.data.payload);

    return true;
  } catch (e) {
    if (e instanceof LangfuseNotFoundError) {
      logger.warn(
        `[BATCH EXPORT] Batch export ${job.data.payload.batchExportId} not found. Job will be skipped.`,
      );
      return true;
    }
    // A retry reruns the identical query, so a ClickHouse timeout or memory
    // limit fails again. Such exports fail on the first attempt.
    const isResourceError = hasClickHouseResourceErrorCause(e);

    await prisma.batchExport.update({
      where: {
        id: job.data.payload.batchExportId,
        projectId: job.data.payload.projectId,
      },
      data: {
        status: BatchExportStatus.FAILED,
        finishedAt: new Date(),
        log: getDisplayError(e, isResourceError),
      },
    });

    logger.error(
      `[BATCH EXPORT] Failed Batch Export job for id ${job.data.payload.batchExportId} and project id ${job.data.payload.projectId}`,
      e,
    );
    traceException(e);
    if (isResourceError) {
      throw new UnrecoverableError(e instanceof Error ? e.message : String(e));
    }
    throw e;
  }
};
