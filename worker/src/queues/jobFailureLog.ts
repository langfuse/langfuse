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
 * the line winston writes for a bare Error. `cause` and `errors` are
 * non-enumerable, so the spread misses them.
 */
function withFields(
  error: unknown,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  if (!(error instanceof Error)) return { error, ...fields };
  return {
    ...error,
    message: error.message,
    stack: error.stack,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
    ...(error instanceof AggregateError ? { errors: error.errors } : {}),
    ...fields,
  };
}

type ProjectScopedPayload = {
  payload?: {
    projectId?: unknown;
    authCheck?: { scope?: { projectId?: unknown } };
  };
};

/**
 * Project a queue job belongs to. Entity and event IDs are caller-supplied and
 * can carry PII, so failure logs identify the job by project and BullMQ job id
 * only; the failed set keeps the full payload for replay.
 */
export function jobProjectId(jobData: unknown): string | undefined {
  const payload = (jobData as ProjectScopedPayload | undefined)?.payload;
  const projectId = payload?.projectId ?? payload?.authCheck?.scope?.projectId;
  return typeof projectId === "string" ? projectId : undefined;
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
