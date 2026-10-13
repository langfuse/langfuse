import { logger, sleep } from "@langfuse/shared/src/server";

/**
 * Returns a uniformly distributed delay in [0, maxMs] milliseconds.
 *
 * Used to spread out the Redis connection setup of workers that boot at the
 * same time, e.g. when autoscaling adds many tasks in one step.
 */
export const getStartupJitterMs = (
  maxMs: number,
  random: () => number = Math.random,
): number => {
  if (maxMs <= 0) return 0;
  return Math.floor(random() * (maxMs + 1));
};

/**
 * Sleeps for a random startup jitter of up to `maxMs` before queue consumers
 * and periodic runners open their Redis connections.
 */
export const delayStartupByJitter = async (maxMs: number): Promise<void> => {
  const jitterMs = getStartupJitterMs(maxMs);
  if (jitterMs <= 0) return;
  logger.info(`Delaying queue registration by ${jitterMs}ms (startup jitter)`);
  await sleep(jitterMs);
};
