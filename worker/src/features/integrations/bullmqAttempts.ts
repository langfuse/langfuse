import { logger } from "@langfuse/shared/src/server";

interface BullmqAttemptState {
  attemptsMade?: number;
  opts?: { attempts?: number };
}

// Fail-closed "is this the last BullMQ attempt" predicate for disable-on-fault
// handlers. Blob storage, PostHog, and Mixpanel share this so a missing
// attempts budget never gets misread as an already-exhausted one.
export function isFinalBullmqAttempt(
  job: BullmqAttemptState,
  error?: unknown,
): boolean {
  // Duck-type on `.name` rather than `instanceof UnrecoverableError`: BullMQ
  // and this worker can each hold their own copy of the error class across a
  // module boundary, so `instanceof` can silently miss a real
  // UnrecoverableError and let the loop keep retrying an unretriable job.
  if (
    error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "UnrecoverableError"
  ) {
    return true;
  }

  const attempts = job.opts?.attempts;
  if (typeof attempts !== "number") {
    logger.warn(
      "[BULLMQ ATTEMPTS] job.opts.attempts is missing; treating as not the final attempt (fail closed)",
    );
    return false;
  }

  const attemptsMade = job.attemptsMade ?? 0;
  return attemptsMade >= attempts - 1;
}
