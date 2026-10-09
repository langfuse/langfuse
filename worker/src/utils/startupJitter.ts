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

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
