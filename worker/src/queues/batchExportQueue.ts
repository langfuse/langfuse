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
import { findInCauseChain } from "../features/batchExport/findInCauseChain";

// Server-side kills of this query alone (TIMEOUT_EXCEEDED, per-query
// MEMORY_LIMIT_EXCEEDED). Client/socket timeouts and total, per-user or
// overcommit memory kills depend on concurrent load and stay retryable.
const QUERY_BOUND_RESOURCE_ERROR_PHRASES = [
  "timeout exceeded",
  "memory limit (for query) exceeded",
];

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
    // A retry reruns the identical query, so it would hit the same limit again.
    const isQueryBoundResourceError = hasQueryBoundResourceErrorCause(e);

    await prisma.batchExport.update({
      where: {
        id: job.data.payload.batchExportId,
        projectId: job.data.payload.projectId,
      },
      data: {
        status: BatchExportStatus.FAILED,
        finishedAt: new Date(),
        log: getDisplayError(e, isQueryBoundResourceError),
      },
    });

    logger.error(
      `[BATCH EXPORT] Failed Batch Export job for id ${job.data.payload.batchExportId} and project id ${job.data.payload.projectId}`,
      e,
    );
    traceException(e);
    if (isQueryBoundResourceError) {
      throw new UnrecoverableError(e instanceof Error ? e.message : String(e));
    }
    throw e;
  }
};

// Read-stream failures reach the processor as the cause of the handler's own
// error, so the resource error can sit anywhere in the cause chain.
const hasQueryBoundResourceErrorCause = (error: unknown): boolean =>
  findInCauseChain(error, (link) => {
    if (!ClickHouseResourceError.is(link)) return false;
    const message = link.message.toLowerCase();
    return QUERY_BOUND_RESOURCE_ERROR_PHRASES.some((phrase) =>
      message.includes(phrase),
    );
  }) !== undefined;

const getDisplayError = (
  e: unknown,
  isQueryBoundResourceError: boolean,
): string => {
  if (isQueryBoundResourceError)
    return ClickHouseResourceError.ERROR_ADVICE_MESSAGE;
  return e instanceof BaseError ? e.message : "An internal error occurred";
};
