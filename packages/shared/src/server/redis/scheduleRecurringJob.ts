import type { Queue } from "bullmq";
import { logger } from "../logger";

// DO NOT REMOVE THIS FILE AND BEHAVIOUR WITHIN A MINOR LANGFUSE VERSION.
// THE CLEANUP BELOW DELETES THE OLD md5-KEYED REPEAT SCHEDULES; WITHOUT IT,
// SELF-HOSTERS UPGRADING FROM A LEGACY-SCHEDULING VERSION GET DUPLICATE CRON
// TRIGGERS FOREVER (bullmq v6 workers keep iterating stranded md5-keyed
// chains; only manual Redis cleanup stops them).
// HOLD THE BULLMQ v6 UPGRADE UNTIL LANGFUSE V5: v6 deletes
// Queue.removeRepeatable(), which this cleanup requires.

/**
 * Registers a recurring cron job on a queue via a BullMQ job scheduler.
 *
 * Job schedulers replace the deprecated `Queue.add(name, data, { repeat })`
 * API. The legacy path replaced the pending next iteration in two separate
 * Redis round trips on every boot (delete the delayed job, then re-create
 * it), so a producer failing between the two - e.g. a container killed
 * mid-boot during a fleet-wide deploy - silently ended the schedule until
 * the next boot re-registered it. `upsertJobScheduler` performs the same
 * replacement in a single atomic Lua script, so concurrent boots and
 * mid-boot crashes cannot lose the chain. BullMQ v6 removes the legacy API
 * entirely.
 *
 * The scheduler id is the job name. Legacy schedules are keyed by
 * md5(name + pattern) instead, so this helper also removes the legacy
 * entries for the current pattern and any historical ones - without that
 * cleanup the old chain keeps firing in parallel with the scheduler. The
 * cleanup is idempotent and must stay in place for as long as a direct
 * upgrade from a Langfuse version that scheduled via the legacy API is
 * supported.
 *
 * Never rejects: scheduling runs fire-and-forget from queue singleton
 * getters, so all failures are logged instead of thrown.
 */
export const scheduleRecurringJob = async (
  queue: Queue,
  opts: {
    jobName: string;
    pattern: string;
    /**
     * Cron patterns this job was registered with via the legacy repeat API
     * in earlier releases. The current pattern is always cleaned up and does
     * not need to be listed. When changing `pattern`, append the old value
     * here, since each legacy pattern was a separate schedule.
     */
    previousPatterns?: string[];
    /** Template data stored on the scheduler and passed to every iteration. */
    data?: Record<string, unknown>;
  },
): Promise<void> => {
  const { jobName, pattern, previousPatterns = [], data } = opts;

  for (const legacyPattern of [pattern, ...previousPatterns]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- Removes schedules created by the deprecated repeat API in earlier releases; keep while direct upgrades from those releases are supported.
      await queue.removeRepeatable(jobName, { pattern: legacyPattern });
    } catch (err) {
      logger.error(
        `Error removing legacy ${jobName} schedule (${legacyPattern}) on ${queue.name}`,
        err,
      );
    }
  }

  try {
    await queue.upsertJobScheduler(
      jobName,
      { pattern },
      { name: jobName, data: data ?? {} },
    );
  } catch (err) {
    logger.error(
      `Error upserting ${jobName} scheduler on ${queue.name} - the recurring job may not run until the next boot`,
      err,
    );
  }
};
