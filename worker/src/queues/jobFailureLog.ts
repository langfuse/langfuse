import {
  isS3SlowDownError,
  logger,
  traceException,
} from "@langfuse/shared/src/server";

import { isFinalBullmqAttempt } from "../features/integrations/bullmqAttempts";

interface AttemptState {
  attemptsMade?: number;
  opts?: { attempts?: number };
}

/**
 * Log a failed queue attempt. Retryable S3 SlowDown stays a warning until the
 * BullMQ attempt budget is spent, then it is logged as an error.
 *
 * `attemptsIncludeCurrentFailure` is set when BullMQ has already incremented
 * `attemptsMade` (the worker `failed` handler, which runs after `moveToFailed`).
 * Processors see the pre-increment count and leave the flag unset.
 */
export function logRetryableJobFailure(params: {
  message: string;
  error: unknown;
  job?: AttemptState;
  attemptsIncludeCurrentFailure?: boolean;
  fields?: Record<string, unknown>;
}): void {
  const { message, error, job, attemptsIncludeCurrentFailure, fields } = params;
  const payload = fields ? { error, ...fields } : error;
  if (
    isS3SlowDownError(error) &&
    job &&
    !isTerminalAttempt(job, error, attemptsIncludeCurrentFailure)
  ) {
    logger.warn(message, payload);
    return;
  }

  logger.error(message, payload);
  traceException(error);
}

function isTerminalAttempt(
  job: AttemptState,
  error: unknown,
  attemptsIncludeCurrentFailure: boolean | undefined,
): boolean {
  const attemptsMade = job.attemptsMade ?? 0;
  const observed = attemptsIncludeCurrentFailure
    ? Math.max(0, attemptsMade - 1)
    : attemptsMade;
  return isFinalBullmqAttempt(
    { attemptsMade: observed, opts: job.opts },
    error,
  );
}
