import { DelayedError, Job, UnrecoverableError } from "bullmq";

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
import {
  BatchExportUserBusyError,
  handleBatchExportJob,
} from "../features/batchExport/handleBatchExportJob";
import { findInCauseChain } from "../features/batchExport/findInCauseChain";

const USER_BUSY_RETRY_DELAY_MS = 30_000;

/**
 * Server-side kills of this query alone: TIMEOUT_EXCEEDED and the per-query
 * MEMORY_LIMIT_EXCEEDED, in both the older and newer ClickHouse wording.
 * Client/socket timeouts and total, per-user or overcommit memory kills depend
 * on concurrent load and stay retryable.
 */
const QUERY_BOUND_RESOURCE_ERROR_PATTERNS: Partial<
  Record<ClickHouseResourceError["errorType"], RegExp>
> = {
  TIMEOUT: /\btimeout exceeded: elapsed\b/i,
  MEMORY_LIMIT:
    /memory limit \(for query\) exceeded|\(for query\) memory limit exceeded/i,
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
    if (e instanceof BatchExportUserBusyError) {
      logger.info(`[BATCH EXPORT] ${e.message}`);
      await job.moveToDelayed(Date.now() + USER_BUSY_RETRY_DELAY_MS, job.token);
      throw new DelayedError();
    }
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

/** Searches the whole cause chain, since the handler wraps read-stream failures. */
const hasQueryBoundResourceErrorCause = (error: unknown): boolean =>
  findInCauseChain(
    error,
    (link) =>
      ClickHouseResourceError.is(link) &&
      (QUERY_BOUND_RESOURCE_ERROR_PATTERNS[link.errorType]?.test(
        link.message,
      ) ??
        false),
  ) !== undefined;

const getDisplayError = (
  e: unknown,
  isQueryBoundResourceError: boolean,
): string => {
  if (isQueryBoundResourceError)
    return ClickHouseResourceError.ERROR_ADVICE_MESSAGE;
  return e instanceof BaseError ? e.message : "An internal error occurred";
};
