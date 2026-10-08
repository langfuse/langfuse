import {
  isS3SlowDownError,
  logger,
  traceException,
} from "@langfuse/shared/src/server";

import { isFinalBullmqAttempt } from "../features/integrations/bullmqAttempts";

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
  const payload = fields ? withFields(error, fields) : error;
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

/**
 * Winston's JSON format serialises an Error nested under a key as `{}`, so the
 * error's own fields, message and stack are lifted next to `fields`, matching
 * the line winston writes for a bare Error.
 */
function withFields(
  error: unknown,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  if (!(error instanceof Error)) return { error, ...fields };
  return { ...error, message: error.message, stack: error.stack, ...fields };
}

type JobIdentityShape = {
  payload?: {
    projectId?: unknown;
    authCheck?: { scope?: { projectId?: unknown } };
    data?: { eventBodyId?: unknown; fileKey?: unknown };
  };
};

/**
 * Project and entity a queue job carries, so a dropped job can be attributed
 * to its project and its events located in blob storage for replay.
 */
export function jobIdentityFields(jobData: unknown): Record<string, string> {
  const payload = (jobData as JobIdentityShape | undefined)?.payload;
  const candidates = {
    projectId: payload?.projectId ?? payload?.authCheck?.scope?.projectId,
    eventBodyId: payload?.data?.eventBodyId,
    fileKey: payload?.data?.fileKey,
  };
  return Object.fromEntries(
    Object.entries(candidates).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * Whether a non-SlowDown failure has used up `budget` attempts. Lets a queue
 * keep a long retry budget for S3 throttling without extending it to failures
 * that retrying will not fix.
 */
export function exceedsNonSlowDownAttemptBudget(
  job: AttemptState,
  error: unknown,
  budget: number,
): boolean {
  return !isS3SlowDownError(error) && (job.attemptsMade ?? 0) >= budget - 1;
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

interface AttemptState {
  attemptsMade?: number;
  opts?: { attempts?: number };
}
