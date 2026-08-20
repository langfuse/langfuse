import { logger } from "@langfuse/shared/src/server";

interface BullmqAttemptState {
  attemptsMade?: number;
  opts?: { attempts?: number };
}

export function isFinalBullmqAttempt(
  job: BullmqAttemptState,
  error?: unknown,
): boolean {
  // Duck-type on `.name`: instanceof can miss a real UnrecoverableError
  // across a module boundary and let the loop keep retrying it.
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
