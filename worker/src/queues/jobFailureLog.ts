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
  return { ...serializeError(error, new WeakSet()), ...fields };
}

/**
 * Plain-object copy of an error and its `cause`/`errors` chain, which are
 * non-enumerable and would otherwise render as `{}`. A cyclic chain renders
 * the repeated error as "[Circular]".
 */
function serializeError(
  error: Error,
  seen: WeakSet<Error>,
): Record<string, unknown> {
  seen.add(error);
  const nested = (value: unknown) => {
    if (!(value instanceof Error)) return value;
    return seen.has(value) ? "[Circular]" : serializeError(value, seen);
  };
  return {
    ...error,
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause === undefined ? {} : { cause: nested(error.cause) }),
    ...(error instanceof AggregateError
      ? { errors: error.errors.map(nested) }
      : {}),
  };
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
